import { useEffect, useState } from "react";
import { useWallet } from "@mysten/dapp-kit";
import { TransactionBlock } from "@mysten/sui";
import WalletConnect from "../components/WalletConnect";
import PriceChart from "../components/PriceChart";

export interface PoolInfo {
  pool_id: string;
  pool_name: string;
  base_asset_id: string;
  quote_asset_id: string;
  base_asset_decimals: number;
  quote_asset_decimals: number;
}

function Swap() {
  const { connected, signAndExecuteTransactionBlock, account } = useWallet();
  const [pools, setPools] = useState<PoolInfo[]>([]);
  const [selectedPool, setSelectedPool] = useState<PoolInfo | null>(null);
  const [fromAmount, setFromAmount] = useState<string>("");
  const [toAmount, setToAmount] = useState<string>("");
  const [slippage, setSlippage] = useState<number>(0.5);
  const [isBaseToQuote, setIsBaseToQuote] = useState<boolean>(true);

  // Fetch all active pools from DeepBook indexer
  useEffect(() => {
    async function fetchPools() {
      try {
        const res = await fetch(
          "https://deepbook-indexer.mainnet.mystenlabs.com/get_pools"
        );
        const data = await res.json();
        if (Array.isArray(data)) {
          setPools(data);
          if (data.length > 0) {
            setSelectedPool(data[0]);
            setIsBaseToQuote(true);
          }
        } else {
          console.error("Unexpected pools data format", data);
        }
      } catch (err) {
        console.error("Failed to fetch pools from DeepBook indexer", err);
      }
    }
    fetchPools();
  }, []);

  // Update estimated "to" amount using BirdEye price data
  useEffect(() => {
    async function updateToAmount() {
      if (!selectedPool || !fromAmount || isNaN(Number(fromAmount))) {
        setToAmount("");
        return;
      }
      const fromVal = parseFloat(fromAmount);
      if (fromVal <= 0) {
        setToAmount("");
        return;
      }
      const baseAddr = selectedPool.base_asset_id;
      const quoteAddr = selectedPool.quote_asset_id;
      const fromTokenAddr = isBaseToQuote ? baseAddr : quoteAddr;
      const toTokenAddr = isBaseToQuote ? quoteAddr : baseAddr;
      try {
        const apiKey = import.meta.env.VITE_BIRDEYE_API_KEY;
        const baseUrl =
          import.meta.env.VITE_BIRDEYE_BASE_URL ||
          "https://public-api.birdeye.so";
        const network = import.meta.env.VITE_BIRDEYE_NETWORK || "sui";

        const fetchTokenPrice = async (addr: string) => {
          const url = `${baseUrl}/defi/price?address=${addr}&include_liquidity=false&check_liquidity=0`;
          const resp = await fetch(url, {
            headers: {
              accept: "application/json",
              "x-chain": network,
              "X-API-KEY": apiKey || "",
            },
          });
          const json = await resp.json();
          return json?.data?.value;
        };

        const [fromPrice, toPrice] = await Promise.all([
          fetchTokenPrice(fromTokenAddr),
          fetchTokenPrice(toTokenAddr),
        ]);
        if (fromPrice && toPrice) {
          const rate = fromPrice / toPrice;
          const estimatedTo = fromVal * rate;
          setToAmount(estimatedTo.toString());
        } else {
          setToAmount("");
        }
      } catch (err) {
        console.error("Error fetching price data from BirdEye", err);
        setToAmount("");
      }
    }
    updateToAmount();
  }, [selectedPool, fromAmount, isBaseToQuote]);

  // Execute the swap transaction using DeepBook V3 on Sui mainnet.
  const handleSwap = async () => {
    if (!selectedPool || !account) return;
    const fromVal = parseFloat(fromAmount);
    if (isNaN(fromVal) || fromVal <= 0) return;

    const baseAddr = selectedPool.base_asset_id;
    const quoteAddr = selectedPool.quote_asset_id;
    const baseDecimals = selectedPool.base_asset_decimals;
    const quoteDecimals = selectedPool.quote_asset_decimals;
    const isSwapBaseToQuote = isBaseToQuote;

    const amountAtomic = BigInt(
      Math.floor(
        fromVal * 10 ** (isSwapBaseToQuote ? baseDecimals : quoteDecimals)
      )
    );

    const tx = new TransactionBlock();
    try {
      const coinType = isSwapBaseToQuote ? baseAddr : quoteAddr;
      const coins = await window.suiWallet?.request({
        method: "sui_getCoins",
        params: [account.address, coinType],
      });
      if (!coins || coins.data.length === 0) {
        alert("No coins of the type you want to swap");
        return;
      }
      const coin =
        coins.data.find((c: any) => BigInt(c.balance) >= amountAtomic) ||
        coins.data[0];
      const coinObj = tx.object(coin.coinObjectId);

      const deepTokenAddr = "0xf4f3d60d5b8e88b3a0f72b2d8b5c1a73de73c45a";
      const deepCoins = await window.suiWallet?.request({
        method: "sui_getCoins",
        params: [account.address, deepTokenAddr],
      });
      if (!deepCoins || deepCoins.data.length === 0) {
        alert("No DEEP tokens available to pay fees for the swap.");
        return;
      }
      const deepCoin = deepCoins.data[0];
      const deepCoinObj = tx.object(deepCoin.coinObjectId);
      const deepFeeAmount = BigInt(10000);

      const poolId = selectedPool.pool_id;
      const baseType = selectedPool.base_asset_id;
      const quoteType = selectedPool.quote_asset_id;
      let functionTarget: string;
      let minOut: bigint;
      if (isSwapBaseToQuote) {
        functionTarget = `${poolId}::pool::swap_exact_base_for_quote`;
        const expectedOut = parseFloat(toAmount || "0");
        const minOutVal = expectedOut * (1 - slippage / 100);
        minOut = BigInt(Math.floor(minOutVal * 10 ** quoteDecimals));
        tx.moveCall({
          target: functionTarget,
          typeArguments: [baseType, quoteType],
          arguments: [
            tx.object(poolId),
            coinObj,
            deepCoinObj,
            tx.pure(minOut),
            tx.object("0x6"),
          ],
        });
      } else {
        functionTarget = `${poolId}::pool::swap_exact_quote_for_base`;
        const expectedOut = parseFloat(toAmount || "0");
        const minOutVal = expectedOut * (1 - slippage / 100);
        minOut = BigInt(Math.floor(minOutVal * 10 ** baseDecimals));
        tx.moveCall({
          target: functionTarget,
          typeArguments: [baseType, quoteType],
          arguments: [
            tx.object(poolId),
            coinObj,
            deepCoinObj,
            tx.pure(minOut),
            tx.object("0x6"),
          ],
        });
      }

      const result = await signAndExecuteTransactionBlock({
        transactionBlock: tx,
        options: { showEffects: true },
      });
      console.log("Swap transaction result", result);
      alert("Swap executed! Tx Hash: " + result.digest);
      setFromAmount("");
      setToAmount("");
    } catch (error) {
      console.error("Swap transaction failed:", error);
      alert("Swap failed: " + (error instanceof Error ? error.message : error));
    }
  };

  return (
    <div className="container">
      <WalletConnect />
      {connected ? (
        <div>
          <div className="swap-panel">
            <label>
              Trading Pair:
              <select
                value={selectedPool?.pool_id || ""}
                onChange={(e) => {
                  const pid = e.target.value;
                  const pool = pools.find((p) => p.pool_id === pid);
                  setSelectedPool(pool || null);
                  setIsBaseToQuote(true);
                  setFromAmount("");
                  setToAmount("");
                }}
              >
                {pools.map((pool) => (
                  <option key={pool.pool_id} value={pool.pool_id}>
                    {pool.pool_name}
                  </option>
                ))}
              </select>
            </label>
            {selectedPool && (
              <>
                <label>
                  From (
                  {isBaseToQuote
                    ? selectedPool.pool_name.split("_")[0]
                    : selectedPool.pool_name.split("_")[1]}
                  ):
                  <input
                    type="number"
                    value={fromAmount}
                    onChange={(e) => setFromAmount(e.target.value)}
                    placeholder="0.0"
                  />
                </label>
                <button
                  type="button"
                  className="flip-button"
                  onClick={() => {
                    setIsBaseToQuote((prev) => !prev);
                    setFromAmount(toAmount);
                    setToAmount(fromAmount);
                  }}
                >
                  ↕
                </button>
                <label>
                  To (
                  {isBaseToQuote
                    ? selectedPool.pool_name.split("_")[1]
                    : selectedPool.pool_name.split("_")[0]}
                  ):
                  <input
                    type="number"
                    value={toAmount}
                    readOnly
                    placeholder="0.0"
                  />
                </label>
                <label>
                  Slippage Tolerance (%):
                  <input
                    type="number"
                    value={slippage}
                    onChange={(e) => setSlippage(Number(e.target.value))}
                    step="0.1"
                    min="0"
                  />
                </label>
                <button
                  onClick={handleSwap}
                  disabled={!fromAmount || parseFloat(fromAmount) <= 0}
                >
                  Swap
                </button>
              </>
            )}
          </div>
          {selectedPool && (
            <PriceChart pool={selectedPool} isBaseToQuote={isBaseToQuote} />
          )}
        </div>
      ) : (
        <p>Please connect your Sui wallet to use the swap.</p>
      )}
    </div>
  );
}

export default Swap;
