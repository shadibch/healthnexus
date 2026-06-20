import { Router, type IRouter } from "express";
import { getSessionUser, requireAuth } from "../lib/session";

const router: IRouter = Router();

// /auth/me intentionally does NOT use requireAuth — deactivated users still need
// to read their own status so the frontend can show the "account deactivated" screen.
router.get("/auth/me", (req, res): void => {
  const user = getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  res.json(user);
});

export default router;
