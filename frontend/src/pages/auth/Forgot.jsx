import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import AuthShell from "./AuthShell";

export default function Forgot() {
  return (
    <AuthShell title="Forgot your password?" subtitle="This installation does not send email, so a person resets it for you.">
      <ol className="steps-list">
        <li><div><b>Ask an administrator.</b><p className="muted">They open Team, find your name and choose Reset password. They get a temporary password to give you.</p></div></li>
        <li><div><b>Sign in with it.</b><p className="muted">You will be asked to choose a new password straight away.</p></div></li>
        <li>
          <div>
            <b>Are you the administrator?</b>
            <p className="muted">Run this on the computer that hosts OptiInspect, from the project folder:</p>
            <code className="code">python manage_users.py reset you@company.com</code>
          </div>
        </li>
      </ol>
      <Link to="/signin" className="btn btn-ghost btn-lg"><ArrowLeft size={18} /> Back to sign in</Link>
    </AuthShell>
  );
}
