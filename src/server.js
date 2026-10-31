import express from "express";
import prisma from "./prisma.js";

const app = express();
app.use(express.json());

app.get("/", (req, res) => res.send("TrackNexa API running"));

app.get("/users", async (req, res) => {
  const users = await prisma.user.findMany();
  res.json(users);
});

app.post("/users", async (req, res) => {
  const { email, name } = req.body;
  const user = await prisma.user.create({ data: { email, name } });
  res.json(user);
});

app.listen(5000, () => console.log("Server on port 5000"));
