import { createUploadthing, type FileRouter } from "uploadthing/next";

const f = createUploadthing();

export const uploadRouter = {
  receiptImage: f(
    {
      image: { maxFileSize: "8MB", maxFileCount: 2 },
    },
    { awaitServerData: false },
  ).onUploadComplete(() => {}),
} satisfies FileRouter;

export type OurFileRouter = typeof uploadRouter;
