import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Home from "@/pages/Home";
import CaseDetail from "@/pages/CaseDetail";
import CommunityDetail from "@/pages/CommunityDetail";
import About from "@/pages/About";
import AdminHome from "@/pages/Admin/AdminHome";
import CaseForm from "@/pages/Admin/CaseForm";
import Login from "@/pages/Admin/Login";
import AboutEditor from "@/pages/Admin/AboutEditor";
import Designers from "@/pages/Admin/Designers";

// 登录验证
const isLoggedIn = () => localStorage.getItem('admin_logged_in') === 'true'

// 受保护的路由组件
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!isLoggedIn()) {
    return <Navigate to="/admin/login" replace />
  }
  return <>{children}</>
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/case/:id" element={<CaseDetail />} />
        <Route path="/community/:name" element={<CommunityDetail />} />
        <Route path="/about" element={<About />} />
        <Route path="/admin/login" element={<Login />} />
        <Route path="/admin" element={
          <ProtectedRoute>
            <AdminHome />
          </ProtectedRoute>
        } />
        <Route path="/admin/cases/new" element={
          <ProtectedRoute>
            <CaseForm />
          </ProtectedRoute>
        } />
        <Route path="/admin/cases/edit/:id" element={
          <ProtectedRoute>
            <CaseForm />
          </ProtectedRoute>
        } />
        <Route path="/admin/about" element={
          <ProtectedRoute>
            <AboutEditor />
          </ProtectedRoute>
        } />
        <Route path="/admin/designers" element={
          <ProtectedRoute>
            <Designers />
          </ProtectedRoute>
        } />
      </Routes>
    </Router>
  );
}
