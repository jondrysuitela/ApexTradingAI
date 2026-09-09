from __future__ import annotations

from datetime import datetime, timezone
from threading import Lock

from fastapi import FastAPI, HTTPException, Query

try:
    import MetaTrader5 as mt5
except Exception:  # pragma: no cover - runtime import guard
    mt5 = None

app = FastAPI(title="MT5 Bridge", version="1.0.0")

LATEST_TICKERS: dict[str, dict] = {}
LATEST_CANDLES: dict[str, dict] = {}
STORE_LOCK = Lock()

SYMBOL_MAP = {
    "USDIDR": ["USDIDR", "USDIDR.i", "USDIDRm"],
    "EURUSD": ["EURUSD", "EURUSD.i", "EURUSDm"],
    "GBPUSD": ["GBPUSD", "GBPUSD.i", "GBPUSDm"],
    "USDJPY": ["USDJPY", "USDJPY.i", "USDJPYm"],
    "XAUUSD": ["XAUUSD", "GOLD", "XAUUSD.i", "XAUUSDm"],
    "XAGUSD": ["XAGUSD", "SILVER", "XAGUSD.i", "XAGUSDm"],
    "SPX": ["SPX", "US500", "SP500", "SPX500"],
    "IXIC": ["IXIC", "NAS100", "NASDAQ", "USTEC"],
}

TIMEFRAME_MAP = {
    "1m": mt5.TIMEFRAME_M1 if mt5 else None,
    "3m": mt5.TIMEFRAME_M5 if mt5 else None,
    "5m": mt5.TIMEFRAME_M5 if mt5 else None,
    "15m": mt5.TIMEFRAME_M15 if mt5 else None,
    "30m": mt5.TIMEFRAME_M30 if mt5 else None,
    "1h": mt5.TIMEFRAME_H1 if mt5 else None,
    "2h": mt5.TIMEFRAME_H2 if mt5 else None,
    "4h": mt5.TIMEFRAME_H4 if mt5 else None,
    "6h": mt5.TIMEFRAME_H4 if mt5 else None,
    "12h": mt5.TIMEFRAME_D1 if mt5 else None,
    "1d": mt5.TIMEFRAME_D1 if mt5 else None,
    "1w": mt5.TIMEFRAME_W1 if mt5 else None,
}


@app.on_event("startup")
def startup() -> None:
    if mt5 is not None:
        try:
            if not mt5.initialize():
                print(f"[WARN] MetaTrader5 initialize failed: {mt5.last_error()}")
        except Exception as exc:
            print(f"[WARN] MetaTrader5 startup error: {exc}")


@app.on_event("shutdown")
def shutdown() -> None:
    if mt5 is not None:
        mt5.shutdown()


@app.get("/health")
def health():
    if mt5 is None:
        return {
            "status": "partial" if LATEST_TICKERS or LATEST_CANDLES else "not_connected",
            "connected": bool(LATEST_TICKERS or LATEST_CANDLES),
            "provider": "mt5-ea" if LATEST_TICKERS or LATEST_CANDLES else "mt5",
            "mode": "cache-only",
            "cachedTickers": len(LATEST_TICKERS),
            "cachedCandles": len(LATEST_CANDLES),
        }
    if not mt5.initialize():
        return {"status": "offline", "connected": False, "provider": "mt5", "error": str(mt5.last_error())}
    terminal = mt5.terminal_info()
    account = mt5.account_info()
    return {
        "status": "ok",
        "connected": True,
        "provider": "mt5",
        "mode": "live",
        "terminal": terminal._asdict() if terminal else None,
        "account": account._asdict() if account else None,
    }


@app.get("/symbols")
def symbols(symbols: str = Query("")):
    requested = [item.strip().upper() for item in symbols.split(",") if item.strip()]
    if mt5 is None:
        return {
            "provider": "mt5",
            "mode": "cache-only",
            "symbols": [symbol_status(symbol, resolve_symbol(symbol), False) for symbol in requested],
        }

    try:
        if not mt5.initialize():
            return {
                "provider": "mt5",
                "mode": "offline",
                "symbols": [symbol_status(symbol, symbol, False) for symbol in requested],
            }
    except Exception:
        return {
            "provider": "mt5",
            "mode": "offline",
            "symbols": [symbol_status(symbol, symbol, False) for symbol in requested],
        }

    if not requested:
        all_symbols = mt5.symbols_get() or []
        return {
            "provider": "mt5",
            "mode": "live",
            "symbols": [{"symbol": item.name, "resolvedSymbol": item.name, "available": True} for item in all_symbols],
        }

    statuses = []
    for symbol in requested:
        try:
            resolved = resolve_symbol(symbol)
            available = mt5.symbol_info(resolved) is not None and mt5.symbol_select(resolved, True)
            statuses.append(symbol_status(symbol, resolved, available))
        except Exception:
            statuses.append(symbol_status(symbol, symbol, False))

    return {"provider": "mt5", "mode": "live", "symbols": statuses}


@app.post("/ingest/ticker")
def ingest_ticker(payload: dict):
    symbol = str(payload.get("symbol") or "").upper()
    if not symbol:
        raise HTTPException(status_code=400, detail="symbol is required")

    with STORE_LOCK:
        LATEST_TICKERS[symbol] = {**payload, "symbol": symbol}

    return {"ok": True, "symbol": symbol}


@app.post("/ingest/candles")
def ingest_candles(payload: dict):
    symbol = str(payload.get("symbol") or "").upper()
    timeframe = str(payload.get("timeframe") or "")
    candles = payload.get("candles") or []
    if not symbol or not timeframe:
        raise HTTPException(status_code=400, detail="symbol and timeframe are required")

    with STORE_LOCK:
        LATEST_CANDLES[f"{symbol}:{timeframe}"] = {**payload, "symbol": symbol, "timeframe": timeframe, "candles": candles}

    return {"ok": True, "symbol": symbol, "timeframe": timeframe, "count": len(candles)}


@app.get("/ticker")
def ticker(symbol: str = Query(..., min_length=1)):
    symbol_name = resolve_symbol(symbol)
    cached = LATEST_TICKERS.get(symbol_name) or LATEST_TICKERS.get(symbol.upper())
    if cached and cached.get("price"):
        return {**cached, "symbol": symbol}

    if mt5 is None:
        raise HTTPException(status_code=503, detail=f"MT5 not available for {symbol_name}")

    try:
        if not mt5.initialize():
            raise HTTPException(status_code=503, detail=f"MT5 offline for {symbol_name}")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=503, detail=f"MT5 error for {symbol_name}")

    if not mt5.symbol_select(symbol_name, True):
        raise HTTPException(status_code=503, detail=f"Symbol not available: {symbol_name}")

    tick = mt5.symbol_info_tick(symbol_name)
    if tick is None:
        raise HTTPException(status_code=503, detail=f"No tick returned for {symbol_name}")

    price = tick.last if tick.last and tick.last > 0 else midpoint(tick.bid, tick.ask)
    if not price or price <= 0:
        price = tick.bid if tick.bid and tick.bid > 0 else tick.ask
    if not price or price <= 0:
        raise HTTPException(status_code=503, detail=f"No valid price returned for {symbol_name}")

    timestamp = datetime.fromtimestamp(tick.time_msc / 1000, tz=timezone.utc).isoformat() if getattr(tick, "time_msc", 0) else datetime.now(timezone.utc).isoformat()
    return {
        "symbol": symbol,
        "resolvedSymbol": symbol_name,
        "price": float(price),
        "timestamp": timestamp,
        "provider": "mt5",
        "source": "local-mt5-bridge",
        "freshness": "LIVE",
    }


@app.get("/candles")
def candles(symbol: str = Query(..., min_length=1), timeframe: str = Query("5m"), limit: int = Query(100, ge=1, le=1000)):
    symbol_name = resolve_symbol(symbol)
    cached = LATEST_CANDLES.get(f"{symbol_name}:{timeframe}") or LATEST_CANDLES.get(f"{symbol.upper()}:{timeframe}")
    if cached and cached.get("candles"):
        return {**cached, "symbol": symbol, "candles": cached.get("candles", [])[-limit:]}

    tf = TIMEFRAME_MAP.get(timeframe)
    if tf is None:
        raise HTTPException(status_code=400, detail=f"Unsupported timeframe: {timeframe}")
    if mt5 is None:
        raise HTTPException(status_code=503, detail=f"No cached candles for {symbol_name}")

    try:
        if not mt5.initialize():
            raise HTTPException(status_code=503, detail=f"MT5 offline for {symbol_name}")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=503, detail=f"MT5 error for {symbol_name}")

    if not mt5.symbol_select(symbol_name, True):
        raise HTTPException(status_code=503, detail=f"Symbol not available: {symbol_name}")

    rates = mt5.copy_rates_from_pos(symbol_name, tf, 0, limit)
    if rates is None or len(rates) == 0:
        raise HTTPException(status_code=503, detail=f"No candles returned for {symbol_name}")

    return {
        "symbol": symbol,
        "resolvedSymbol": symbol_name,
        "candles": [
            {
                "timestamp": datetime.fromtimestamp(rate["time"], tz=timezone.utc).isoformat(),
                "open": float(rate["open"]),
                "high": float(rate["high"]),
                "low": float(rate["low"]),
                "close": float(rate["close"]),
                "volume": float(rate["tick_volume"]),
            }
            for rate in rates
        ],
    }


@app.get("/account")
def account():
    if mt5 is None or not mt5.initialize():
        raise HTTPException(status_code=503, detail="MT5 offline")
    info = mt5.account_info()
    if info is None:
        raise HTTPException(status_code=503, detail=f"account_info failed: {mt5.last_error()}")
    trade_mode = getattr(info, "trade_mode", 0)
    account_type = "demo" if trade_mode == 0 else "contest" if trade_mode == 1 else "real"
    return {
        "login": info.login,
        "name": info.name,
        "server": info.server,
        "currency": info.currency,
        "balance": float(info.balance),
        "equity": float(info.equity),
        "margin": float(info.margin),
        "marginFree": float(info.margin_free),
        "leverage": info.leverage,
        "tradeAllowed": bool(info.trade_allowed),
        "regMode": getattr(info, "reg_hedging", 0),
        "tradeMode": trade_mode,
        "accountType": account_type,
    }


@app.get("/symbol")
def symbol_details(symbol: str = Query(..., min_length=1)):
    if mt5 is None or not mt5.initialize():
        raise HTTPException(status_code=503, detail="MT5 offline")
    symbol_name = resolve_symbol(symbol)
    info = mt5.symbol_info(symbol_name)
    if info is None:
        raise HTTPException(status_code=404, detail=f"Symbol not found: {symbol_name}")
    tick = mt5.symbol_info_tick(symbol_name)
    spread_points = int(info.spread) if info.spread else None
    spread_price = float(spread_points * info.point) if spread_points is not None and info.point else None
    return {
        "symbol": symbol,
        "resolvedSymbol": symbol_name,
        "digits": info.digits,
        "volumeMin": float(info.volume_min),
        "volumeMax": float(info.volume_max),
        "volumeStep": float(info.volume_step),
        "tickSize": float(info.trade_tick_size),
        "contractSize": float(info.trade_contract_size),
        "tradeMode": int(info.trade_mode),
        "tradeCalcMode": int(info.trade_calc_mode),
        "point": float(info.point),
        "spread": spread_points,
        "spreadPrice": spread_price,
        "bid": float(tick.bid) if tick else None,
        "ask": float(tick.ask) if tick else None,
        "mode": "live" if mt5.initialize() else "offline",
    }


@app.post("/order")
def place_order(payload: dict):
    if mt5 is None:
        raise HTTPException(status_code=503, detail="MT5 module not available")
    if not mt5.initialize():
        raise HTTPException(status_code=503, detail=f"MT5 offline: {mt5.last_error()}")

    symbol = str(payload.get("symbol") or "").strip().upper()
    side = str(payload.get("side") or "").lower()
    volume = float(payload.get("volume") or 0)
    sl = payload.get("sl")
    tp = payload.get("tp")
    deviation = int(payload.get("deviation") or 20)
    magic = int(payload.get("magic") or 0)
    comment = str(payload.get("comment") or "trader-web")

    if not symbol:
        raise HTTPException(status_code=400, detail="symbol is required")
    if side not in ("buy", "sell"):
        raise HTTPException(status_code=400, detail="side must be buy or sell")
    if volume <= 0:
        raise HTTPException(status_code=400, detail="volume must be positive")

    symbol_name = resolve_symbol(symbol)
    if not mt5.symbol_select(symbol_name, True):
        raise HTTPException(status_code=400, detail=f"symbol not available: {symbol_name}")

    info = mt5.symbol_info(symbol_name)
    if info is None:
        raise HTTPException(status_code=400, detail=f"no symbol info for {symbol_name}")

    volume = clamp_volume(volume, info.volume_min, info.volume_max, info.volume_step)

    tick = mt5.symbol_info_tick(symbol_name)
    if tick is None:
        raise HTTPException(status_code=503, detail=f"no tick for {symbol_name}")

    request = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": symbol_name,
        "volume": round(volume, 8),
        "type": mt5.ORDER_TYPE_BUY if side == "buy" else mt5.ORDER_TYPE_SELL,
        "price": float(tick.ask if side == "buy" else tick.bid),
        "deviation": deviation,
        "magic": magic,
        "comment": comment,
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": mt5.ORDER_FILLING_IOC,
    }
    if sl is not None and _finite(sl):
        request["sl"] = float(sl)
    if tp is not None and _finite(tp):
        request["tp"] = float(tp)

    result = mt5.order_send(request)
    if result is None:
        raise HTTPException(status_code=500, detail=f"order_send failed: {mt5.last_error()}")

    return {
        "retcode": result.retcode,
        "retcodeLabel": retcode_label(result.retcode),
        "comment": result.comment,
        "request": request,
        "order": mt5_asdict(result.order),
        "deal": mt5_asdict(result.deal),
        "price": float(result.price) if result.price else None,
        "volume": float(result.volume) if result.volume else None,
        "filled": result.retcode == mt5.TRADE_RETCODE_DONE,
    }


@app.get("/positions")
def positions(symbol: str = Query("")):
    if mt5 is None or not mt5.initialize():
        raise HTTPException(status_code=503, detail="MT5 offline")
    account = mt5.account_info()
    positions_list = mt5.positions_get()
    if positions_list is None:
        raise HTTPException(status_code=503, detail=f"positions_get failed: {mt5.last_error()}")
    symbol_name = resolve_symbol(symbol) if symbol else None
    items = []
    for pos in positions_list:
        if symbol_name and pos.symbol != symbol_name:
            continue
        items.append(
            {
                "ticket": pos.ticket,
                "symbol": pos.symbol,
                "type": int(pos.type),
                "typeLabel": "BUY" if pos.type == mt5.POSITION_TYPE_BUY else "SELL",
                "volume": float(pos.volume),
                "priceOpen": float(pos.price_open),
                "priceCurrent": float(pos.price_current),
                "sl": float(pos.sl) if pos.sl else None,
                "tp": float(pos.tp) if pos.tp else None,
                "profit": float(pos.profit),
                "swap": float(pos.swap),
                "totalProfit": float(pos.profit + pos.swap),
                "time": datetime.fromtimestamp(pos.time, tz=timezone.utc).isoformat(),
                "magic": int(pos.magic),
                "comment": pos.comment or "",
            }
        )
    return {
        "status": "ok",
        "positions": items,
        "account": {
            "login": int(account.login) if account else None,
            "name": account.name if account else None,
            "server": account.server if account else None,
            "currency": account.currency if account else None,
            "balance": float(account.balance) if account else None,
            "equity": float(account.equity) if account else None,
            "margin": float(account.margin) if account else None,
            "marginFree": float(account.margin_free) if account else None,
        }
        if account
        else None,
    }


@app.post("/close")
def close_position(payload: dict):
    if mt5 is None:
        raise HTTPException(status_code=503, detail="MT5 module not available")
    if not mt5.initialize():
        raise HTTPException(status_code=503, detail=f"MT5 offline: {mt5.last_error()}")

    ticket = payload.get("ticket")
    deviation = int(payload.get("deviation") or 20)
    if ticket is None:
        raise HTTPException(status_code=400, detail="ticket is required")
    ticket = int(ticket)

    positions = mt5.positions_get(ticket=ticket)
    if not positions:
        raise HTTPException(status_code=404, detail=f"position not found: {ticket}")
    pos = positions[0]

    tick = mt5.symbol_info_tick(pos.symbol)
    if tick is None:
        raise HTTPException(status_code=503, detail=f"no tick for {pos.symbol}")

    request = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": pos.symbol,
        "volume": float(pos.volume),
        "type": mt5.ORDER_TYPE_SELL if pos.type == mt5.POSITION_TYPE_BUY else mt5.ORDER_TYPE_BUY,
        "position": pos.ticket,
        "price": float(tick.bid if pos.type == mt5.POSITION_TYPE_BUY else tick.ask),
        "deviation": deviation,
        "magic": pos.magic,
        "comment": "close-web",
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": mt5.ORDER_FILLING_IOC,
    }
    result = mt5.order_send(request)
    if result is None:
        raise HTTPException(status_code=500, detail=f"order_send failed: {mt5.last_error()}")

    return {
        "retcode": result.retcode,
        "retcodeLabel": retcode_label(result.retcode),
        "comment": result.comment,
        "order": mt5_asdict(result.order),
        "deal": mt5_asdict(result.deal),
        "price": float(result.price) if result.price else None,
        "volume": float(result.volume) if result.volume else None,
        "filled": result.retcode == mt5.TRADE_RETCODE_DONE,
    }


@app.post("/close-all")
def close_all_positions(payload: dict):
    if mt5 is None:
        raise HTTPException(status_code=503, detail="MT5 module not available")
    if not mt5.initialize():
        raise HTTPException(status_code=503, detail=f"MT5 offline: {mt5.last_error()}")

    deviation = int(payload.get("deviation") or 20)
    positions = mt5.positions_get()
    if positions is None:
        raise HTTPException(status_code=503, detail=f"positions_get failed: {mt5.last_error()}")

    results = []
    for pos in positions:
        tick = mt5.symbol_info_tick(pos.symbol)
        if tick is None:
            results.append(
                {
                    "ticket": pos.ticket,
                    "symbol": pos.symbol,
                    "filled": False,
                    "retcodeLabel": "NO_TICK",
                    "price": None,
                    "comment": "no tick available",
                }
            )
            continue
        request = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": pos.symbol,
            "volume": float(pos.volume),
            "type": mt5.ORDER_TYPE_SELL if pos.type == mt5.POSITION_TYPE_BUY else mt5.ORDER_TYPE_BUY,
            "position": pos.ticket,
            "price": float(tick.bid if pos.type == mt5.POSITION_TYPE_BUY else tick.ask),
            "deviation": deviation,
            "magic": pos.magic,
            "comment": "close-all-web",
            "type_time": mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_IOC,
        }
        result = mt5.order_send(request)
        if result is None:
            results.append(
                {
                    "ticket": pos.ticket,
                    "symbol": pos.symbol,
                    "filled": False,
                    "retcodeLabel": "ORDER_SEND_FAILED",
                    "price": None,
                    "comment": str(mt5.last_error()),
                }
            )
            continue
        results.append(
            {
                "ticket": pos.ticket,
                "symbol": pos.symbol,
                "filled": result.retcode == mt5.TRADE_RETCODE_DONE,
                "retcodeLabel": retcode_label(result.retcode),
                "price": float(result.price) if result.price else None,
                "comment": result.comment or "",
            }
        )

    return {
        "status": "ok",
        "results": results,
        "filled": bool(results) and all(item["filled"] for item in results),
    }


RETCODE_LABELS = {
    10004: "TRADE_RETCODE_REQUOTE",
    10006: "TRADE_RETCODE_REJECT",
    10007: "TRADE_RETCODE_CANCEL",
    10008: "TRADE_RETCODE_PLACED",
    10009: "TRADE_RETCODE_DONE",
    10010: "TRADE_RETCODE_DONE_PARTIAL",
    10011: "TRADE_RETCODE_ERROR",
    10012: "TRADE_RETCODE_TIMEOUT",
    10013: "TRADE_RETCODE_INVALID",
    10014: "TRADE_RETCODE_INVALID_VOLUME",
    10015: "TRADE_RETCODE_INVALID_PRICE",
    10016: "TRADE_RETCODE_INVALID_STOPS",
    10017: "TRADE_RETCODE_TRADE_DISABLED",
    10018: "TRADE_RETCODE_MARKET_CLOSED",
    10019: "TRADE_RETCODE_NO_MONEY",
    10020: "TRADE_RETCODE_PRICE_CHANGED",
    10021: "TRADE_RETCODE_PRICE_OFF",
    10022: "TRADE_RETCODE_INVALID_EXPIRATION",
    10023: "TRADE_RETCODE_ORDER_CHANGED",
    10024: "TRADE_RETCODE_TOO_MANY_REQUESTS",
    10025: "TRADE_RETCODE_NO_CHANGES",
    10026: "TRADE_RETCODE_SERVER_DISABLES_AT",
    10027: "TRADE_RETCODE_CLIENT_DISABLES_AT",
    10028: "TRADE_RETCODE_LOCKED",
    10029: "TRADE_RETCODE_FROZEN",
    10030: "TRADE_RETCODE_INVALID_FILL",
    10031: "TRADE_RETCODE_CONNECTION",
    10032: "TRADE_RETCODE_ONLY_REAL",
    10033: "TRADE_RETCODE_LIMIT_ORDERS",
    10034: "TRADE_RETCODE_LIMIT_VOLUME",
    10035: "TRADE_RETCODE_INVALID_ORDER",
    10036: "TRADE_RETCODE_UNKNOWN_POSITION",
    10037: "TRADE_RETCODE_UNKNOWN_ORDER",
    10038: "TRADE_RETCODE_DEAL_LOCKED",
    10039: "TRADE_RETCODE_ORDER_LOCKED",
    10040: "TRADE_RETCODE_LONG_POSITIONS_ONLY_ALLOWED",
    10041: "TRADE_RETCODE_SHORT_POSITIONS_ONLY_ALLOWED",
    10042: "TRADE_RETCODE_TRADE_HEDGE_PROHIBITED",
    10045: "TRADE_RETCODE_CLOSE_ONLY",
    10046: "TRADE_RETCODE_FIFO_CLOSE",
    10052: "TRADE_RETCODE_NO_SYMBOL",
    10053: "TRADE_RETCODE_MODIFY_DENIED",
    10055: "TRADE_RETCODE_CLOSE_DENIED",
    10057: "TRADE_RETCODE_MIN_DISTANCE",
    10064: "TRADE_RETCODE_AUTOTRADING_DISABLED",
}


def retcode_label(retcode: int) -> str:
    return RETCODE_LABELS.get(int(retcode), f"UNKNOWN_RETCODE_{int(retcode)}")


def clamp_volume(volume: float, volume_min: float, volume_max: float, volume_step: float) -> float:
    if volume_step <= 0:
        volume_step = 0.01
    clamped = min(max(volume, volume_min), volume_max)
    steps = round((clamped - volume_min) / volume_step)
    return volume_min + steps * volume_step


def mt5_asdict(value: object) -> dict | None:
    if value is None:
        return None
    asdict = getattr(value, "_asdict", None)
    if callable(asdict):
        return asdict()
    if isinstance(value, int):
        return {"ticket": value}
    return None


def _finite(value: object) -> bool:
    try:
        f = float(value)
        import math
        return math.isfinite(f)
    except (TypeError, ValueError):
        return False


def resolve_symbol(symbol: str) -> str:
    normalized = "".join(ch for ch in symbol.upper() if ch.isalnum())
    candidates = SYMBOL_MAP.get(normalized, [normalized])
    if mt5 is None:
        return candidates[0]
    for candidate in candidates:
        if mt5.symbol_info(candidate) is not None:
            return candidate

    available = mt5.symbols_get() or []
    for item in available:
        name = getattr(item, "name", "") or ""
        normalized_name = "".join(ch for ch in name.upper() if ch.isalnum())
        if normalized_name == normalized:
            return name

    for item in available:
        name = getattr(item, "name", "") or ""
        normalized_name = "".join(ch for ch in name.upper() if ch.isalnum())
        if normalized_name.startswith(normalized) or normalized.startswith(normalized_name):
            return name

    for item in available:
        name = getattr(item, "name", "") or ""
        normalized_name = "".join(ch for ch in name.upper() if ch.isalnum())
        if normalized in normalized_name or normalized_name in normalized:
            return name

    return candidates[0]


def midpoint(bid: float | None, ask: float | None) -> float | None:
    if bid is None or ask is None:
        return None
    if bid <= 0 or ask <= 0:
        return None
    return (bid + ask) / 2


def symbol_status(symbol: str, resolved_symbol: str, available: bool) -> dict:
    return {"symbol": symbol, "resolvedSymbol": resolved_symbol, "available": bool(available)}
