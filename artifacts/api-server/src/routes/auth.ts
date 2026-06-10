import { Router, type IRouter } from "express";
import { getSessionUser, requireAuth } from "../lib/session";

const router: IRouter = Router();

router.get("/auth/me", requireAuth, (req, res): void => {
  const user = getSessionUser(req)!;
  res.json(user);
});

export default router;
