import { useEffect, useRef } from "react";
import { createChart, ColorType, LineStyle } from "lightweight-charts";
import { PoolInfo } from "../pages/Swap";

interface PriceChartProps {
  pool: PoolInfo;
  isBaseToQuote: boolean;
}

function PriceChart({ pool, isBaseToQuote }: PriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;
    chartRef.current = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 300,
      layout: {
        background: { type: ColorType.Solid, color: "#000" },
        textColor: "#e0e0e0",
      },
      grid: {
        vertLines: { color: "#444", style: LineStyle.Dotted },
        horzLines: { color: "#444", style: LineStyle.Dotted },
      },
    });
    seriesRef.current = chartRef.current.addCandlestickSeries({
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderVisible: false,
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
    });
    return () => {
      chartRef.current.remove();
    };
  }, []);

  useEffect(() => {
    async function fetchOHLCV() {
      if (!seriesRef.current) return;
      const baseUrl =
        import.meta.env.VITE_BIRDEYE_BASE_URL ||
        "https://public-api.birdeye.so";
      const apiKey = import.meta.env.VITE_BIRDEYE_API_KEY;
      const network = import.meta.env.VITE_BIRDEYE_NETWORK || "sui";
      const { base_asset_id, quote_asset_id } = pool;
      const now = Math.floor(Date.now() / 1000);
      const oneDayAgo = now - 24 * 60 * 60;
      const url = `${baseUrl}/defi/ohlcv/base_quote?base_address=${base_asset_id}&quote_address=${quote_asset_id}&type=15m&time_from=${oneDayAgo}&time_to=${now}`;
      try {
        const resp = await fetch(url, {
          headers: {
            accept: "application/json",
            "x-chain": network,
            "X-API-KEY": apiKey || "",
          },
        });
        const data = await resp.json();
        if (data.data) {
          const candleData = data.data.map((entry: any) => ({
            time: entry.startTime,
            open: entry.open,
            high: entry.high,
            low: entry.low,
            close: entry.close,
          }));
          seriesRef.current.setData(candleData);
        }
      } catch (err) {
        console.error("Failed to fetch OHLCV data", err);
      }
    }
    fetchOHLCV();
  }, [pool, isBaseToQuote]);

  return <div className="chart-container" ref={chartContainerRef}></div>;
}

export default PriceChart;
