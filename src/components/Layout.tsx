import { Link } from "react-router-dom";

interface LayoutProps {
  children: React.ReactNode;
}

function Layout({ children }: LayoutProps) {
  return (
    <div>
      <header className="header">
        <h1>Cerebra Network Swap</h1>
        <nav className="nav">
          <Link to="/">Swap</Link>
          {/* Future links can be added here */}
        </nav>
      </header>
      <main>{children}</main>
      <footer className="footer">
        <p>
          &copy; {new Date().getFullYear()} Cerebra Network. All rights
          reserved.
        </p>
      </footer>
    </div>
  );
}

export default Layout;
