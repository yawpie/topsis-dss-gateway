/**
 * disini isinya nanti fungsi untuk melakukan perhitungan topsis,
 * mungkin bisa dibuat class Topsis dengan method-method untuk melakukan perhitungan topsis
 * atau bisa juga dibuat fungsi-fungsi terpisah untuk setiap langkah perhitungan topsis,
 * misalnya fungsi untuk normalisasi, fungsi untuk menghitung jarak ideal positif dan negatif, dll
 */
/**
 * disini nanti isinya fungsi untuk menerima file excel yang diupload oleh user,
 * kemudian membaca data dari file tersebut dan menyimpan hasil proses data itu ke database
 * menggunakan prisma
 *
 * mungkin bisa dibuat endpoint POST /upload yang menerima file excel,
 * kemudian menggunakan library seperti xlsx untuk membaca data dari file tersebut,
 * lalu menyimpan data ke database menggunakan prisma
 *
 */

import { prisma } from "./lib/prisma";
import { createPrismaUtils, HttpError } from "@yawpie/prisma-handler";
import { sendData, sendError } from "./utils/send";
import { Router } from "express";
import { upload } from "./middlewares/uploadMiddleware";
import { apiPost } from "./utils/apiClient";
import { paginate } from "./utils/pagination";
import authMiddleware from "./middlewares/authMiddleware";

const handledPrisma = createPrismaUtils(prisma);

type CriterionBody = {
  name: string;
  weight: number;
  type: "BENEFIT" | "COST";
};

const getCriterion = async () => {
  const criteria = await handledPrisma.handleNotFound(() =>
    prisma.criterion.findMany({
      select: {
        name: true,
        weight: true,
        type: true,
      },
    }),
  );
  return criteria?.map((criterion) => ({
    name: criterion.name,
    weight: criterion.weight,
    type: criterion.type,
  })) || null;
};

type Students = {
  name: string;
  ipk: number;
  income: number;
  dependents: number;
  achievement_score: number;
  organization_score: number;
  semester: number;
  unique_name: string;
};
type TopsisProcessorResponseRaw = {
  message: string;
  data: TopsisDataResult[];
};
type TopsisDataResult = {
  nama: string;
  unique_name: string;
  nilai_preferensi: number;
  jarak_ideal_positif: number;
  jarak_ideal_negatif: number;
  kriteria: {
    ipk: number;
    semester: number;
    penghasilan_ortu: number;
    jumlah_tanggungan: number;
    keaktifan_organisasi: number | string;
    skor_prestasi: number | string;
  };
  ranking?: number;
};

const router = Router();
router.post("/upload", authMiddleware, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      sendError(res, new HttpError("No files uploaded", 400));
      return;
    }

    const file = req.file;
    const form = new FormData();
    let criteria: CriterionBody[] | null = await getCriterion();
    if (!criteria) {
      if (process.env.NODE_ENV === "development") {
        console.warn(
          "No criteria found in database, using default criteria for development",
        );
        criteria = [
          {
            name: "ipk",
            weight: 0.3,
            type: "BENEFIT",
          },
          {
            name: "penghasilan_ortu",
            weight: 0.2,
            type: "COST",
          },
          {
            name: "jumlah_tanggungan",
            weight: 0.1,
            type: "COST",
          },
          {
            name: "skor_prestasi",
            weight: 0.2,
            type: "BENEFIT",
          },
          {
            name: "keaktifan_organisasi",
            weight: 0.2,
            type: "BENEFIT",
          },
        ];
      } else {
        throw new HttpError("No criteria found in database, please configure criteria first", 500);
      }
    }
    form.append("criterionBody", JSON.stringify(criteria));
    form.append("file", new Blob([new Uint8Array(file.buffer)]), file.originalname);
    const calculateResult: TopsisProcessorResponseRaw = await apiPost(
      "/calculate",
      form,
    );

    sendData(
      res,
      { count: calculateResult.data.length || 0 },
    );

  } catch (error) {
    console.error(error);
    if (error instanceof HttpError) {
      sendError(res, error, error.status, error.message);
      return;
    }
    sendError(res, error);
  }
});

/**
 * endpoint untuk menerima file json hasil kalkulasi topsis dari processor,
 * lalu menyimpan data ke database
 * mungkin bisa dibuat endpoint POST /write-topsis yang menerima file json,
 * kemudian membaca data dari file tersebut,
 * lalu menyimpan data ke database menggunakan prisma
 */
router.post("/write-topsis", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      sendError(res, new HttpError("No files uploaded", 400));
      return;
    }

    const file = req.file;
    const fileContent = file.buffer.toString("utf-8");
    const data: TopsisDataResult[] = JSON.parse(fileContent);

    const transaction = await prisma.$transaction(async (tx) => {
      const writeResult = data.map(async (item) => {
        await tx.results.create({
          data: {
            rank: item.ranking || -1,
            score: item.nilai_preferensi,
            student: { connect: { unique_name: item.unique_name } },
          },
        });
        return {
          rank: item.ranking || -1,
          score: item.nilai_preferensi,
        };
      });
      return writeResult;
    });
    sendData(
      res,
      { insertedCount: transaction.length },
      "Successfully written topsis results to database",
    );
  } catch (error) {
    console.error(error);
    sendError(res, new HttpError("Unknown error occurred", 500));
  }
});

router.get("/data", async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 10;
    const sort = req.query.sortBy as string | undefined;
    const students = await paginate(
      (skip, take) =>
        prisma.student.findMany({
          skip,
          take,
          orderBy: sort ? { [sort]: "asc" } : undefined,
        }),
      () => prisma.student.count(),
      { page, pageSize: pageSize },
    );
    sendData(res, students, "Data retrieved successfully");
  } catch (error) {
    console.error(error);
    sendError(res, new HttpError("Failed to retrieve data", 500));
  }
});

export default router;
