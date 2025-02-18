import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Swap from "./pages/Swap";

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Swap />} />
        {/* Future routes can be added here */}
      </Routes>
    </Layout>
  );
}

export default App;
