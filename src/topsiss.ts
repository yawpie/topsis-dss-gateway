// /**
//  * disini isinya nanti fungsi untuk melakukan perhitungan topsis,
//  * mungkin bisa dibuat class Topsis dengan method-method untuk melakukan perhitungan topsis
//  * atau bisa juga dibuat fungsi-fungsi terpisah untuk setiap langkah perhitungan topsis,
//  * misalnya fungsi untuk normalisasi, fungsi untuk menghitung jarak ideal positif dan negatif, dll
//  */
// /**
//  * disini nanti isinya fungsi untuk menerima file excel yang diupload oleh user,
//  * kemudian membaca data dari file tersebut dan menyimpan hasil proses data itu ke database
//  * menggunakan prisma
//  *
//  * mungkin bisa dibuat endpoint POST /upload yang menerima file excel,
//  * kemudian menggunakan library seperti xlsx untuk membaca data dari file tersebut,
//  * lalu menyimpan data ke database menggunakan prisma
//  *
//  */

// import { prisma } from "./lib/prisma";
// import { createPrismaUtils, HttpError } from "@yawpie/prisma-handler";
// import { sendData, sendError } from "./utils/send";
// import { Router } from "express";
// import { upload } from "./middlewares/uploadMiddleware";

// type StudentUploadInput = {
//   name: string;
//   ipk: number;
//   income: number;
//   dependents: number;
//   achievement_score: number;
//   organization_score: number;
//   semester: number;
// };

// type SpreadsheetRow = Record<string, unknown>;

// const handledPrisma = createPrismaUtils(prisma);
// const REQUIRED_HEADERS = {
//   name: ["name", "nama"],
//   ipk: ["ipk", "gpa"],
//   income: ["income", "penghasilan", "parentincome", "orangtuapenghasilan"],
//   dependents: [
//     "dependents",
//     "tanggungan",
//     "jumlah_tanggungan",
//     "jumlahtanggungan",
//   ],
//   achievement_score: [
//     "achievementscore",
//     "achievement_score",
//     "prestasi",
//     "skorprestasi",
//   ],
//   organization_score: [
//     "organizationscore",
//     "organization_score",
//     "organisasi",
//     "skororganisasi",
//   ],
//   semester: ["semester", "smt"],
// } satisfies Record<keyof StudentUploadInput, string[]>;

// function normalizeHeader(value: string) {
//   return value
//     .trim()
//     .toLowerCase()
//     .replace(/[^a-z0-9]+/g, "");
// }

// function getCellValue(row: SpreadsheetRow, aliases: string[]) {
//   for (const [key, value] of Object.entries(row)) {
//     if (aliases.includes(normalizeHeader(key))) {
//       return value;
//     }
//   }

//   return undefined;
// }

// function parseNumber(
//   value: unknown,
//   field: string,
//   rowNumber: number,
//   fileName: string,
// ) {
//   const numericValue =
//     typeof value === "number"
//       ? value
//       : Number(
//           String(value ?? "")
//             .trim()
//             .replace(",", "."),
//         );

//   if (!Number.isFinite(numericValue)) {
//     throw new HttpError(
//       `Invalid "${field}" value in ${fileName} at row ${rowNumber}`,
//       400,
//     );
//   }

//   return numericValue;
// }

// function mapRowToStudent(
//   row: SpreadsheetRow,
//   rowNumber: number,
//   fileName: string,
// ): StudentUploadInput {
//   const name = String(getCellValue(row, REQUIRED_HEADERS.name) ?? "").trim();
//   if (!name) {
//     throw new HttpError(
//       `Missing "name" value in ${fileName} at row ${rowNumber}`,
//       400,
//     );
//   }

//   return {
//     name,
//     ipk: parseNumber(
//       getCellValue(row, REQUIRED_HEADERS.ipk),
//       "ipk",
//       rowNumber,
//       fileName,
//     ),
//     income: parseNumber(
//       getCellValue(row, REQUIRED_HEADERS.income),
//       "income",
//       rowNumber,
//       fileName,
//     ),
//     dependents: Math.trunc(
//       parseNumber(
//         getCellValue(row, REQUIRED_HEADERS.dependents),
//         "dependents",
//         rowNumber,
//         fileName,
//       ),
//     ),
//     achievement_score: parseNumber(
//       getCellValue(row, REQUIRED_HEADERS.achievement_score),
//       "achievement_score",
//       rowNumber,
//       fileName,
//     ),
//     organization_score: parseNumber(
//       getCellValue(row, REQUIRED_HEADERS.organization_score),
//       "organization_score",
//       rowNumber,
//       fileName,
//     ),
//     semester: Math.trunc(
//       parseNumber(
//         getCellValue(row, REQUIRED_HEADERS.semester),
//         "semester",
//         rowNumber,
//         fileName,
//       ),
//     ),
//   };
// }

// function parseCsvLine(line: string) {
//   const values: string[] = [];
//   let currentValue = "";
//   let insideQuotes = false;

//   for (let index = 0; index < line.length; index += 1) {
//     const char = line[index];

//     if (char === '"') {
//       if (insideQuotes && line[index + 1] === '"') {
//         currentValue += '"';
//         index += 1;
//       } else {
//         insideQuotes = !insideQuotes;
//       }
//       continue;
//     }

//     if (char === "," && !insideQuotes) {
//       values.push(currentValue);
//       currentValue = "";
//       continue;
//     }

//     currentValue += char;
//   }

//   values.push(currentValue);
//   return values.map((value) => value.trim());
// }

// function parseCsvBuffer(buffer: Buffer) {
//   const lines = buffer
//     .toString("utf8")
//     .replace(/^\uFEFF/, "")
//     .split(/\r?\n/)
//     .map((line) => line.trim())
//     .filter(Boolean);

//   if (lines.length < 2) {
//     throw new HttpError(
//       "Uploaded CSV file does not contain any data rows",
//       400,
//     );
//   }

//   const headers = parseCsvLine(lines[0]);
//   return lines.slice(1).map<SpreadsheetRow>((line) => {
//     const cells = parseCsvLine(line);
//     return headers.reduce<SpreadsheetRow>((row, header, index) => {
//       row[header] = cells[index] ?? "";
//       return row;
//     }, {});
//   });
// }

// async function parseSpreadsheetFile(file: Express.Multer.File) {
//   const extension = file.originalname.split(".").pop()?.toLowerCase() ?? "";

//   if (extension === "csv") {
//     return parseCsvBuffer(file.buffer);
//   }

//   if (["xlsx", "xls", "xlsm", "xlsb"].includes(extension)) {
//     try {
//       const loadXlsx = new Function("return import('xlsx')");
//       const xlsx = (await loadXlsx()) as {
//         read: (
//           data: Buffer,
//           options: { type: "buffer" },
//         ) => {
//           SheetNames: string[];
//           Sheets: Record<string, unknown>;
//         };
//         utils: {
//           sheet_to_json: <T>(
//             sheet: unknown,
//             options: { defval: string },
//           ) => T[];
//         };
//       };
//       const workbook = xlsx.read(file.buffer, { type: "buffer" });
//       const firstSheetName = workbook.SheetNames[0];

//       if (!firstSheetName) {
//         throw new HttpError(
//           `File ${file.originalname} does not contain any sheets`,
//           400,
//         );
//       }

//       return xlsx.utils.sheet_to_json<SpreadsheetRow>(
//         workbook.Sheets[firstSheetName],
//         { defval: "" },
//       );
//     } catch (error) {
//       if (error instanceof HttpError) {
//         throw error;
//       }

//       throw new HttpError(
//         'Excel uploads require the "xlsx" package to be installed on the backend',
//         500,
//       );
//     }
//   }

//   throw new HttpError(`Unsupported file type for ${file.originalname}`, 400);
// }

// const router = Router();
// router.post("/upload", upload.array("file"), async (req, res) => {
//   try {
//     if (!req.files || req.files.length === 0) {
//       sendError(res, new HttpError("No files uploaded", 400));
//       return;
//     }

//     const files = req.files as Express.Multer.File[];
//     const students = (
//       await Promise.all(
//         files.map(async (file) => {
//           const rows = await parseSpreadsheetFile(file);
//           return rows.map((row, index) =>
//             mapRowToStudent(row, index + 2, file.originalname),
//           );
//         }),
//       )
//     ).flat();

//     if (students.length === 0) {
//       throw new HttpError("No valid student rows found in uploaded files", 400);
//     }

//     const result = await handledPrisma.handleWrite(() =>
//       prisma.student.createMany({
//         data: students,
//       }),
//     );

//     sendData(
//       res,
//       { insertedCount: result.count, processedFiles: files.length },
//       "Files uploaded and processed successfully",
//     );
//   } catch (error) {
//     console.error(error);
//     if (error instanceof HttpError) {
//       sendError(res, error, error.status, error.message);
//       return;
//     }
//     sendError(res, error);
//   }
// });

// export default router;
