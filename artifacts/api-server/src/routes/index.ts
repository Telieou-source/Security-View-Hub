import { Router, type IRouter } from "express";
import healthRouter from "./health";
import feedsRouter from "./feeds";
import indicatorsRouter from "./indicators";
import statsRouter from "./stats";
import exportsRouter from "./exports";
import historyRouter from "./history";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/feeds", feedsRouter);
router.use("/indicators", indicatorsRouter);
router.use("/stats", statsRouter);
router.use("/export", exportsRouter);
router.use("/history", historyRouter);

export default router;
