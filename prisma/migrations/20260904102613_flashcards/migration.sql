-- CreateEnum
CREATE TYPE "FlashcardKind" AS ENUM ('CONCEPT', 'FORMULA', 'DISTINCTION', 'APPLICATION', 'PITFALL');

-- CreateTable
CREATE TABLE "Flashcard" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "front" TEXT NOT NULL,
    "back" TEXT NOT NULL,
    "kind" "FlashcardKind" NOT NULL DEFAULT 'CONCEPT',
    "position" INTEGER NOT NULL DEFAULT 0,
    "sourceMaterialId" TEXT,
    "sourceExcerpt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Flashcard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Flashcard_topicId_position_idx" ON "Flashcard"("topicId", "position");

-- AddForeignKey
ALTER TABLE "Flashcard" ADD CONSTRAINT "Flashcard_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flashcard" ADD CONSTRAINT "Flashcard_sourceMaterialId_fkey" FOREIGN KEY ("sourceMaterialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;
