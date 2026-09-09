#property strict
#property version   "1.0"
#property description "Exports MT5 market data to a local HTTP bridge"

input string BridgeBaseUrl = "http://127.0.0.1:8787";
input string Symbols = "USDIDR,EURUSD,GBPUSD,USDJPY,XAUUSD,XAGUSD,SPX,IXIC";
input ENUM_TIMEFRAMES ExportTimeframe = PERIOD_M5;
input int TimerSeconds = 3;

string SymbolList[];

int OnInit()
{
   int count = StringSplit(Symbols, ',', SymbolList);
   if(count <= 0)
   {
      Print("MT5BridgeEA: no symbols configured");
      return(INIT_FAILED);
   }

   EventSetTimer(TimerSeconds);
   Print("MT5BridgeEA initialized with ", count, " symbols");
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
   EventKillTimer();
}

void OnTimer()
{
   for(int i = 0; i < ArraySize(SymbolList); i++)
   {
      string symbol = StringTrim(SymbolList[i]);
      if(symbol == "")
         continue;

      ExportTicker(symbol);
      ExportCandles(symbol, ExportTimeframe, 100);
   }
}

void ExportTicker(string symbol)
{
   if(!SymbolSelect(symbol, true))
      return;

   MqlTick tick;
   if(!SymbolInfoTick(symbol, tick))
      return;

   double price = tick.last > 0 ? tick.last : (tick.bid > 0 && tick.ask > 0 ? (tick.bid + tick.ask) / 2.0 : tick.bid > 0 ? tick.bid : tick.ask);
   if(price <= 0)
      return;

   string payload = StringFormat("{\"symbol\":\"%s\",\"price\":%.10f,\"timestamp\":\"%s\",\"provider\":\"mt5-ea\",\"source\":\"local-mt5-ea\",\"freshness\":\"LIVE\"}", symbol, price, TimeToString(TimeCurrent(), TIME_DATE | TIME_SECONDS));
   PostJson("/ingest/ticker", payload);
}

void ExportCandles(string symbol, ENUM_TIMEFRAMES timeframe, int limit)
{
   if(!SymbolSelect(symbol, true))
      return;

   MqlRates rates[];
   int copied = CopyRates(symbol, timeframe, 0, limit, rates);
   if(copied <= 0)
      return;

   string candles = "[";
   for(int i = copied - 1; i >= 0; i--)
   {
      candles += StringFormat("{\"timestamp\":\"%s\",\"open\":%.10f,\"high\":%.10f,\"low\":%.10f,\"close\":%.10f,\"volume\":%.0f}%s",
         TimeToString(rates[i].time, TIME_DATE | TIME_SECONDS),
         rates[i].open,
         rates[i].high,
         rates[i].low,
         rates[i].close,
         (double)rates[i].tick_volume,
         i == 0 ? "" : ",");
   }
   candles += "]";

   string payload = StringFormat("{\"symbol\":\"%s\",\"timeframe\":\"%s\",\"candles\":%s,\"provider\":\"mt5-ea\",\"source\":\"local-mt5-ea\",\"freshness\":\"LIVE\"}", symbol, EnumToString(timeframe), candles);
   PostJson("/ingest/candles", payload);
}

void PostJson(string path, string payload)
{
   string url = BridgeBaseUrl + path;
   char post_data[];
   StringToCharArray(payload, post_data);
   char result[];
   string headers = "Content-Type: application/json\r\n";
   string result_headers;

   ResetLastError();
   int status = WebRequest("POST", url, headers, 5000, post_data, result, result_headers);
   if(status == -1)
      Print("MT5BridgeEA WebRequest failed: ", GetLastError(), " url=", url);
}

string StringTrim(string value)
{
   return StringTrimRight(StringTrimLeft(value));
}
