import { Suspense, lazy } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import Landing from "./pages/landing/Landing";
import SignIn from "./pages/auth/SignIn";
import SignUp from "./pages/auth/SignUp";
import Forgot from "./pages/auth/Forgot";
import { Rings } from "./components/bits";
import { useAuth } from "./lib/auth";

const AppLayout = lazy(() => import("./pages/app/AppLayout"));
const Dashboard = lazy(() => import("./pages/app/Dashboard"));
const Inspect = lazy(() => import("./pages/app/Inspect"));
const Inspections = lazy(() => import("./pages/app/Inspections"));
const InspectionDetail = lazy(() => import("./pages/app/InspectionDetail"));
const Review = lazy(() => import("./pages/app/Review"));
const Audit = lazy(() => import("./pages/app/Audit"));
const Insights = lazy(() => import("./pages/app/Insights"));
const StressTest = lazy(() => import("./pages/app/StressTest"));
const Challenge = lazy(() => import("./pages/app/Challenge"));
const Lab = lazy(() => import("./pages/app/Lab"));
const Products = lazy(() => import("./pages/app/Products"));
const Team = lazy(() => import("./pages/app/Team"));
const Settings = lazy(() => import("./pages/app/Settings"));
const Help = lazy(() => import("./pages/app/Help"));

function Loader() {
  return <div className="loader-screen" role="status" aria-label="Loading"><Rings size={96} /></div>;
}

function RequireAuth({ children }) {
  const { user, loading, error } = useAuth();
  const location = useLocation();
  if (loading) return <Loader />;
  if (error && !user) return <NotReachable message={error.message} />;
  if (!user) return <Navigate to="/signin" state={{ from: location }} replace />;
  return children;
}

function RequireAdmin({ children }) {
  const { can } = useAuth();
  if (!can.admin) return <Navigate to="/app/dashboard" replace />;
  return children;
}

function NotReachable({ message }) {
  return (
    <div className="loader-screen"><div className="empty"><Rings /><h3>Cannot reach the server</h3><p>{message}</p><button className="btn btn-primary" onClick={() => window.location.reload()}>Try again</button></div></div>
  );
}

function NotFound() {
  return (
    <div className="loader-screen"><div className="empty"><Rings /><h3>This page does not exist</h3><p>The address may be mistyped, or the page was moved.</p><Link to="/" className="btn btn-primary">Go to the home page</Link></div></div>
  );
}

export default function App() {
  const { loading } = useAuth();
  if (loading) return <Loader />;
  return (
    <Suspense fallback={<Loader />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/forgot" element={<Forgot />} />
        <Route path="/app" element={<RequireAuth><AppLayout /></RequireAuth>}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="inspect" element={<Inspect />} />
          <Route path="inspections" element={<Inspections />} />
          <Route path="inspections/:id" element={<InspectionDetail />} />
          <Route path="review" element={<Review />} />
          <Route path="review/:id/:defect?" element={<Review />} />
          <Route path="audit" element={<Audit />} />
          <Route path="audit/:id" element={<Audit />} />
          <Route path="insights" element={<Insights />} />
          <Route path="stress" element={<StressTest />} />
          <Route path="challenge" element={<Challenge />} />
          <Route path="lab" element={<Lab />} />
          <Route path="products" element={<Products />} />
          <Route path="team" element={<RequireAdmin><Team /></RequireAdmin>} />
          <Route path="settings" element={<Settings />} />
          <Route path="help" element={<Help />} />
          <Route path="*" element={<Navigate to="dashboard" replace />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
