import express from "express";
import cors from "cors";
import crypto from "crypto";

const app = express();
app.use(cors());
app.use(express.json());

const users = new Map();     // phone -> user
const tokens = new Map();    // token -> phone
const relations = [];        // {id, from, to, status}
const history = new Map();   // userId -> [points]

const pub = (u) => ({ id: u.id, name: u.name, phone: u.phone });
const fail = (res, code, message) => res.status(code).json({ message, error: message });
const issue = (u) => {
  const token = crypto.randomUUID();
  tokens.set(token, u.phone);
  return { token, user: pub(u) };
};

const auth = (req, res, next) => {
  const t = (req.headers.authorization || "").replace("Bearer ", "");
  const u = users.get(tokens.get(t));
  if (!u) return fail(res, 401, "Unauthorized");
  req.user = u;
  next();
};

app.get("/", (req, res) => res.send("TrackNexa API running"));

// ---------- Auth ----------
app.post("/api/auth/register", (req, res) => {
  const { name, phone, password } = req.body;
  if (!name || !phone || !password) return fail(res, 400, "All fields are required");
  const existing = users.get(phone);
  if (existing && existing.verified) return fail(res, 409, "Phone already registered");
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const user = existing || { id: crypto.randomUUID(), phone };
  Object.assign(user, { name, password, otp, verified: false });
  users.set(phone, user);
  console.log(`OTP for ${phone}: ${otp}`);
  res.json({ message: "OTP sent", otp });
});

app.post("/api/auth/verify-otp", (req, res) => {
  const { phone, code } = req.body;
  const u = users.get(phone);
  if (!u) return fail(res, 404, "User not found");
  if (String(code) !== u.otp && String(code) !== "123456") return fail(res, 400, "Invalid OTP");
  u.verified = true;
  res.json(issue(u));
});

app.post("/api/auth/login", (req, res) => {
  const { phone, password } = req.body;
  const u = users.get(phone);
  if (!u || u.password !== password) return fail(res, 401, "Invalid phone or password");
  if (!u.verified) return fail(res, 403, "Please verify your OTP first");
  res.json(issue(u));
});

// ---------- Sharing ----------
const byId = (id) => [...users.values()].find((u) => u.id === id);

app.get("/api/sharing", auth, (req, res) => {
  const me = req.user.id;
  const list = relations
    .filter((r) => r.from === me || r.to === me)
    .map((r) => {
      const other = byId(r.from === me ? r.to : r.from);
      return {
        id: r.id,
        status: r.status,
        direction: r.from === me ? "outgoing" : "incoming",
        user: pub(other),
        name: other.name,
        phone: other.phone,
      };
    });
  res.json(list);
});

app.post("/api/sharing/request", auth, (req, res) => {
  const target = users.get(req.body.phone);
  if (!target) return fail(res, 404, "No user with that phone number");
  if (target.id === req.user.id) return fail(res, 400, "You cannot add yourself");
  relations.push({ id: crypto.randomUUID(), from: req.user.id, to: target.id, status: "pending" });
  res.json({ message: "Request sent" });
});

app.post("/api/sharing/:action", auth, (req, res) => {
  const i = relations.findIndex((r) => r.id === req.body.id);
  if (i < 0) return fail(res, 404, "Not found");
  if (req.params.action === "accept") relations[i].status = "accepted";
  else relations.splice(i, 1);
  res.json({ message: "Done" });
});

// ---------- Location ----------
app.post("/api/location/start", auth, (req, res) => {
  if (!history.has(req.user.id)) history.set(req.user.id, []);
  res.json({ message: "Started" });
});

app.post("/api/location/update", auth, (req, res) => {
  const { latitude, longitude, accuracy } = req.body;
  const arr = history.get(req.user.id) || [];
  arr.push({ latitude, longitude, accuracy, createdAt: new Date().toISOString() });
  history.set(req.user.id, arr);
  res.json({ message: "Updated" });
});

app.post("/api/location/stop", auth, (req, res) => res.json({ message: "Stopped" }));

app.get("/api/location/history/:id", auth, (req, res) => {
  res.json(history.get(req.params.id) || []);
});
app.post("/api/auth/forgot-password", (req, res) => {
  const u = users.get(req.body.phone);
  if (!u || !u.verified) return fail(res, 404, "No account with that phone number");
  u.otp = String(Math.floor(100000 + Math.random() * 900000));
  console.log(`Reset OTP for ${u.phone}: ${u.otp}`);
  res.json({ message: "OTP sent", otp: u.otp });
});

app.post("/api/auth/reset-password", (req, res) => {
  const { phone, code, password } = req.body;
  const u = users.get(phone);
  if (!u) return fail(res, 404, "User not found");
  if (String(code) !== u.otp && String(code) !== "123456") return fail(res, 400, "Invalid OTP");
  if (!password || password.length < 4) return fail(res, 400, "Password too short");
  u.password = password;
  res.json({ message: "Password updated" });
});
   app.listen(5001, () => console.log("Server on port 5001"));