import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import OrganizerDashboard from './pages/OrganizerDashboard';
import StudentDashboard from './pages/StudentDashboard';
import './App.css';

function App() {
  return (
    <Router>
      <div className="qsams-container">
        <nav className="top-nav">
          <h1 className="logo">QSAMS</h1>
          <div className="nav-links">
            <Link to="/">Student Scan</Link>
            <Link to="/organizer">Organizer Panel</Link>
          </div>
        </nav>

        <main className="content">
          <Routes>
            <Route path="/" element={<StudentDashboard />} />
            <Route path="/organizer" element={<OrganizerDashboard />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;