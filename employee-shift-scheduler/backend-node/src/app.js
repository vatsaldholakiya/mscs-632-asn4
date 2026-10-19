// Routes for the Node backend. Same REST API as the Python backend.
import express from "express";
import cors from "cors";
import { ROSTER, store } from "./store.js";

export function createApp() {
  const app = express();
  app.use(cors()); // let the browser frontend call this API from another port
  app.use(express.json());

  app.get("/meta", (req, res) => res.json({ backend: "Node (Express)" }));

  app.get("/employees", (req, res) => {
    res.json(ROSTER.map((e) => ({ ...e, submitted: store.submitted(e.id) })));
  });

  app.get("/employees/:id/preferences", (req, res) => {
    const { id } = req.params;
    if (!store.isKnown(id)) return res.status(404).json({ error: `Unknown employee ${id}` });
    res.json({ id, preferences: store.get(id) });
  });

  app.put("/employees/:id/preferences", (req, res) => {
    const { id } = req.params;
    if (!store.isKnown(id)) return res.status(404).json({ error: `Unknown employee ${id}` });
    store.put(id, (req.body && req.body.preferences) || {});
    res.json(store.status());
  });

  app.get("/status", (req, res) => res.json(store.status()));

  app.post("/demo/sample", (req, res) => {
    store.loadSample();
    res.json(store.status());
  });

  app.post("/demo/reset", (req, res) => {
    store.reset();
    res.json(store.status());
  });

  app.use((req, res) => res.status(404).json({ error: "Not found" }));

  // Malformed JSON and anything unexpected come back as a JSON error, not an HTML page.
  app.use((err, req, res, next) => {
    res.status(err.status || 500).json({ error: err.message || "Server error" });
  });

  return app;
}
