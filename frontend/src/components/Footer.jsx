import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <div className="logo"><span className="logo-mark">S</span> Sloto</div>
            <p style={{ fontSize: '0.92rem', maxWidth: 300 }}>
              Find trusted professionals and book appointments online — anytime, from anywhere.
            </p>
          </div>
          <div>
            <h4>Explore</h4>
            <Link to="/providers">Browse providers</Link>
            <Link to="/categories">Categories</Link>
            <Link to="/register">Join as provider</Link>
          </div>
          <div>
            <h4>Account</h4>
            <Link to="/login">Sign in</Link>
            <Link to="/dashboard">My bookings</Link>
            <Link to="/profile">Profile</Link>
          </div>
          <div>
            <h4>Legal</h4>
            <a href="#">Terms</a>
            <a href="#">Privacy</a>
            <a href="#">Support</a>
          </div>
        </div>
        <div className="footer-bottom">© {new Date().getFullYear()} Sloto. All rights reserved.</div>
      </div>
    </footer>
  );
}