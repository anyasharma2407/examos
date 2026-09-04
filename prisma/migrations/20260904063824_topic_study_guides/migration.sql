-- CreateTable
CREATE TABLE "TopicGuide" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "keyIdeas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pitfalls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "videoSearches" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "suggestedReading" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TopicGuide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuideReading" (
    "id" TEXT NOT NULL,
    "guideId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "chunkId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "focus" TEXT NOT NULL,
    "reason" TEXT NOT NULL,

    CONSTRAINT "GuideReading_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TopicGuide_topicId_key" ON "TopicGuide"("topicId");

-- CreateIndex
CREATE INDEX "TopicGuide_topicId_idx" ON "TopicGuide"("topicId");

-- CreateIndex
CREATE INDEX "GuideReading_guideId_position_idx" ON "GuideReading"("guideId", "position");

-- CreateIndex
CREATE INDEX "GuideReading_materialId_idx" ON "GuideReading"("materialId");

-- AddForeignKey
ALTER TABLE "TopicGuide" ADD CONSTRAINT "TopicGuide_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuideReading" ADD CONSTRAINT "GuideReading_guideId_fkey" FOREIGN KEY ("guideId") REFERENCES "TopicGuide"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuideReading" ADD CONSTRAINT "GuideReading_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuideReading" ADD CONSTRAINT "GuideReading_chunkId_fkey" FOREIGN KEY ("chunkId") REFERENCES "MaterialChunk"("id") ON DELETE SET NULL ON UPDATE CASCADE;
