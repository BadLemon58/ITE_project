import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import OrganizerDashboard from './pages/OrganizerDashboard';
import StudentDashboard from './pages/StudentDashboard';
import './App.css';
import ndmcLogo from './assets/NDMC_Seal.png';

function App() {
  return (
    <Router>
   
<div className="qsams-container">
  <nav className="top-nav">
  <img src="/vite.png" alt="School Seal" className="school-seal-img" />
  
  
  <p className="school-title">Quick Student Attendance Monitoring System</p>
  
  <div className="nav-links">
  <NavLink to="/" end>Student Scan</NavLink>
  <NavLink to="/organizer">Organizer Panel</NavLink>
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