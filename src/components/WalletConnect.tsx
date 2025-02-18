import { useWallet, useWallets } from "@mysten/dapp-kit";

function WalletConnect() {
  const { connected, connecting, account, disconnect } = useWallet();
  const { select } = useWallets();

  const handleConnectClick = async () => {
    try {
      await select();
    } catch (err) {
      console.error("Wallet connect error", err);
    }
  };

  if (connected && account) {
    const address = account.address;
    return (
      <div style={{ marginBottom: "1rem" }}>
        <p>
          Connected as:{" "}
          <code>
            {address.slice(0, 6)}...{address.slice(-4)}
          </code>
        </p>
        <button onClick={disconnect}>Disconnect</button>
      </div>
    );
  }

  return (
    <button onClick={handleConnectClick} disabled={connecting}>
      {connecting ? "Connecting..." : "Connect Wallet"}
    </button>
  );
}

export default WalletConnect;
