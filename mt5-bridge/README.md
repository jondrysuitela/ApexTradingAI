# MT5 Bridge

Local FastAPI bridge for MetaTrader 5.

## Run

1. Install Python dependencies.
2. Install the `MetaTrader5` Python package.
3. Make sure the MT5 terminal is open and logged in.
4. Start the server:

```bash
uvicorn server:app --host 127.0.0.1 --port 8787
```

## MT5 EA mode

If you want MT5 to push data directly, use `mql5/MT5BridgeEA.mq5`.

1. Import the EA into MetaEditor.
2. Allow WebRequest for `http://127.0.0.1:8787` in MT5.
3. Attach the EA to any chart.
4. Adjust `Symbols` and `ExportTimeframe` to match your broker.

## Endpoints

- `GET /health`
- `GET /ticker?symbol=USDIDR`
- `GET /candles?symbol=USDIDR&timeframe=5m&limit=100`

## Symbol mapping

Edit `SYMBOL_MAP` in `server.py` to match your broker's MT5 symbol names.
