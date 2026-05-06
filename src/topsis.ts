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

const handledPrisma = createPrismaUtils(prisma);
const router = Router();
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      sendError(res, new HttpError("No files uploaded", 400));
      return;
    }

    const file = req.file;

    const calculateResult: TopsisProcessorResponseRaw = await apiPost(
      "/calculate-np",
      {
        file,
      },
    );
    const students: Students[] = calculateResult.data.map((item) => ({
      name: item.nama,
      ipk: item.kriteria.ipk,
      income: item.kriteria.penghasilan_ortu,
      dependents: item.kriteria.jumlah_tanggungan,
      achievement_score:
        typeof item.kriteria.skor_prestasi === "number"
          ? item.kriteria.skor_prestasi
          : 0,
      organization_score:
        typeof item.kriteria.keaktifan_organisasi === "number"
          ? item.kriteria.keaktifan_organisasi
          : 0,
      semester: item.kriteria.semester,
      unique_name: item.unique_name,
    }));

    const result = await handledPrisma.handleWrite(() =>
      prisma.student.createMany({
        data: students,
      }),
    );

    sendData(
      res,
      { insertedCount: result.count },
      "Files uploaded and processed successfully",
    );

    // const resultTransaction = await prisma.$transaction(async (tx) => {
    //   const createdStudents = await tx.student.createMany({
    //     data: students,
    //   });

    //   return { insertedCount: createdStudents.count };
    // });
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
        }
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

export default router;

