export const PROJECT_PROGRESS_VERSION = 2;

type ProgressStatus = 'pending' | 'current' | 'completed';

const COMPLETED_STATUSES = new Set(['completed', 'awaiting_signature']);
const CURRENT_STATUSES = new Set(['current', 'in_progress']);

const isCompleted = (item: any) => Boolean(
  item && (COMPLETED_STATUSES.has(String(item.status || '')) || item.submitted),
);

const isCurrent = (item: any) => Boolean(
  item && CURRENT_STATUSES.has(String(item.status || '')),
);

const hasPhotos = (item: any) => Boolean(item?.acceptanceRecord?.photos?.length);

const hasStarted = (item: any) => Boolean(
  item && (
    isCurrent(item) ||
    isCompleted(item) ||
    item.actualStartDate ||
    item.startedAt ||
    item.submitTime ||
    item.updateTime ||
    item.acceptanceRecord?.startedAt ||
    item.acceptanceRecord?.completedAt ||
    hasPhotos(item)
  )
);

export function buildProjectProgressSummary(nodesData: any[] = []) {
  const stages = (Array.isArray(nodesData) ? nodesData : []).map((node: any, index: number) => {
    let stageTotal = 0;
    let stageCompleted = 0;
    let anyStarted = hasStarted(node);

    (node?.sections || []).forEach((section: any) => {
      const subNodes = Array.isArray(section?.subNodes) ? section.subNodes : [];
      const sectionCompleted = isCompleted(section);
      anyStarted = anyStarted || hasStarted(section);

      if (subNodes.length === 0) {
        stageTotal += 1;
        if (sectionCompleted) stageCompleted += 1;
        return;
      }

      subNodes.forEach((subNode: any) => {
        stageTotal += 1;
        // A submitted section is authoritative: all checks in it are complete.
        if (sectionCompleted || isCompleted(subNode)) stageCompleted += 1;
        anyStarted = anyStarted || hasStarted(subNode);
      });
    });

    let status: ProgressStatus = 'pending';
    if (stageTotal > 0 && stageCompleted >= stageTotal) status = 'completed';
    else if (stageCompleted > 0 || anyStarted) status = 'current';

    return {
      name: String(node?.name || `阶段${index + 1}`),
      status,
      stageCompleted,
      stageTotal,
      isCurrentPosition: false,
    };
  });

  let currentIndex = stages.reduce(
    (last: number, stage: any, index: number) => stage.status === 'current' ? index : last,
    -1,
  );
  if (currentIndex < 0) {
    currentIndex = stages.reduce(
      (last: number, stage: any, index: number) => stage.status === 'completed' ? index : last,
      -1,
    );
  }
  if (currentIndex < 0 && stages.length > 0) currentIndex = 0;
  if (currentIndex >= 0) stages[currentIndex].isCurrentPosition = true;

  const completedSubNodes = stages.reduce((sum, stage) => sum + stage.stageCompleted, 0);
  const totalSubNodes = stages.reduce((sum, stage) => sum + stage.stageTotal, 0);
  const completedStages = stages.filter((stage) => stage.status === 'completed').length;
  const nodesList = stages.map((stage) => stage.name);
  const nodesCount = nodesList.length;
  const currentNode = currentIndex >= 0 ? currentIndex + 1 : 0;
  const currentProgress = nodesCount > 1
    ? Math.max(0, currentNode - 1) / (nodesCount - 1)
    : (nodesCount === 1 ? 1 : 0);
  const currentStage = currentIndex >= 0 ? stages[currentIndex] : null;

  return {
    algorithmVersion: PROJECT_PROGRESS_VERSION,
    currentNode,
    currentNodeName: currentStage?.name || '',
    nodeName: currentStage?.name || '',
    currentNodeStatus: currentStage?.status || 'pending',
    waitingForNextStage: Boolean(
      currentStage?.status === 'completed' && currentIndex < stages.length - 1,
    ),
    nodesCount,
    nodesList,
    stageStatuses: stages,
    currentProgress,
    progressPercent: totalSubNodes > 0
      ? Math.round((completedSubNodes / totalSubNodes) * 100)
      : Math.round(currentProgress * 100),
    completedStages,
    completedSubNodes,
    totalSubNodes,
    updatedAt: Date.now(),
  };
}

export function isCurrentProjectProgressSummary(summary: any) {
  return Number(summary?.algorithmVersion || 0) >= PROJECT_PROGRESS_VERSION;
}
