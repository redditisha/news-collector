import type { PipelineStatus } from "@/lib/pipeline";

/** The slice of pipeline status the sidebar's collector badge needs. */
export type PipelinePanelStatus = Pick<PipelineStatus, "lastCollectedAt" | "lastCollectedBy" | "freshness">;
