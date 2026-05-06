// src/middleware/upload.ts
import multer from "multer";
import { BadRequestError } from "@yawpie/prisma-handler";

const storage = multer.memoryStorage();
const ALLOWED_MIME_TYPES = ["text/csv", "application/csv"];
// const ALLOWED_EXTENSIONS = [".csv", ".xls", ".xlsx", ".xlsm", ".xlsb"];
const ALLOWED_EXTENSIONS = [".csv"];

export const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (_req, file, cb) => {
    const fileName = file.originalname.toLowerCase();
    const hasAllowedExtension = ALLOWED_EXTENSIONS.some((extension) =>
      fileName.endsWith(extension),
    );
    const hasAllowedMimeType = ALLOWED_MIME_TYPES.includes(file.mimetype);

    if (!hasAllowedExtension && !hasAllowedMimeType) {
      cb(new BadRequestError("Only CSV files are allowed!"));
    } else {
      cb(null, true);
    }
  },
});

