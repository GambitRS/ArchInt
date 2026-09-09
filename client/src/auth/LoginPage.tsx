import type { FormEventHandler } from "react";
import { Brand } from "../components/Brand";
import { Diagram, makeExample } from "../diagram";

type LoginPageProps = {
  email: string;
  password: string;
  busy: boolean;
  error: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
};

export function LoginPage({
  email,
  password,
  busy,
  error,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: LoginPageProps) {
  return (
    <main className="login">
      <section className="login-form">
        <Brand />
        <form className="login-content" onSubmit={onSubmit}>
          <span className="eyebrow">YOUR IDEAS. CONNECTED.</span>
          <h1>
            Make the complex
            <br />
            look simple.
          </h1>
          <p>
            A space to map systems, connect ideas,
            <br />
            and bring your next big picture to life.
          </p>
          <h2>Welcome back</h2>
          <label>
            Email address
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              placeholder="you@company.com"
              onChange={(e) => onEmailChange(e.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              placeholder="Enter your password"
              onChange={(e) => onPasswordChange(e.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="primary wide" disabled={busy}>
            {busy ? "Connecting…" : "Sign in to your workspace"}
            <span>↗</span>
          </button>
          <div className="demo-note">
            <span>◉</span> Your drawings, saved in your workspace.
          </div>
        </form>
        <small>ArchInt / A little clarity goes a long way.</small>
      </section>
      <section className="login-art">
        <div className="art-label">
          <span className="status-dot" /> FROM FIRST THOUGHT TO FULL PICTURE
        </div>
        <div className="art-paper">
          <Diagram elements={makeExample()} />
        </div>
        <div className="art-caption">
          <span>01 / THE BIG PICTURE</span>
          <h2>
            Everything connects.
            <br />
            Give it a place.
          </h2>
          <p>Architecture diagrams, workflows, and ideas worth sharing.</p>
        </div>
        <div className="art-corner">↗</div>
      </section>
    </main>
  );
}
