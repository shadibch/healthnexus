import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import patientsRouter from "./patients";
import doctorsRouter from "./doctors";
import appointmentsRouter from "./appointments";
import queueRouter from "./queue";
import consultationsRouter from "./consultations";
import prescriptionsRouter from "./prescriptions";
import medicationsRouter from "./medications";
import stockRouter from "./stock";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(patientsRouter);
router.use(doctorsRouter);
router.use(appointmentsRouter);
router.use(queueRouter);
router.use(consultationsRouter);
router.use(prescriptionsRouter);
router.use(medicationsRouter);
router.use(stockRouter);
router.use(dashboardRouter);

export default router;
