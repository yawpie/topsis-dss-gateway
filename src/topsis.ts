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

type TopsisProcessorResponseRaw = {
  message: string;
  data: TopsisDataResult[];
};

type TopsisDataResult = {
  nama: string;
  provinsi?: string | null;
  nilai_preferensi: number;
  jarak_ideal_positif: number;
  jarak_ideal_negatif: number;
  kriteria: Record<string, number | string | null | undefined>;
  ranking?: number;
};

const DEFAULT_CRITERIA: CriterionBody[] = [
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
    weight: 0.1,
    type: "BENEFIT",
  },
  {
    name: "keaktifan_organisasi",
    weight: 0.1,
    type: "BENEFIT",
  },
  {
    name: "semester",
    weight: 0.2,
    type: "COST",
  },
];

const getCriterion = async () => {
  const criteria = await prisma.kriteria.findMany({
    select: {
      nama_kriteria: true,
      bobot: true,
      jenis: true,
    },
  });

  if (criteria.length === 0) {
    return null;
  }

  return criteria.map((criterion) => ({
    name: criterion.nama_kriteria,
    weight: Number(criterion.bobot),
    type: criterion.jenis,
  }));
};

const getCriteriaForProcessing = async () => {
  let criteria: CriterionBody[] | null = await getCriterion();
  if (!criteria) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "No criteria found in database, using default criteria for development",
      );
      criteria = DEFAULT_CRITERIA;
    } else {
      throw new HttpError(
        "No criteria found in database, please configure criteria first",
        500,
      );
    }
  }

  return criteria;
};

const getPriorityCategories = (data: TopsisDataResult[]) => {
  const sorted = [...data].sort((left, right) => {
    const leftRank = left.ranking ?? Number.MAX_SAFE_INTEGER;
    const rightRank = right.ranking ?? Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    return right.nilai_preferensi - left.nilai_preferensi;
  });

  return new Map(
    sorted.map((item, index) => {
      const ratio = sorted.length === 0 ? 0 : index / sorted.length;
      const kategori = ratio < 0.3 ? "Tinggi" : ratio < 0.7 ? "Sedang" : "Rendah";
      //todo ganti item.nama dengan kode_alternatif yang harus ada di tiap request (mungkin gunakan middleware untuk validasi dan bikin jika tidak ada di body)
      return [item.nama, kategori]; 
    }),
  );
};

const parseCriterionValue = (criterionName: string, value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new HttpError(
      `Invalid value for criterion '${criterionName}'`,
      400,
    );
  }

  return parsed;
};

const getMaxCriterionCode = (criteria: { kode_kriteria: string }[]) =>
  criteria.reduce((max, criterion) => {
    const match = /^C(\d+)$/i.exec(criterion.kode_kriteria);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

const persistTopsisResults = async (
  data: TopsisDataResult[],
  criteria: CriterionBody[],
) => {
  const categories = getPriorityCategories(data);

  return prisma.$transaction(async (tx) => {
    const existingCriteria = await tx.kriteria.findMany({
      select: {
        id_kriteria: true,
        kode_kriteria: true,
        nama_kriteria: true,
      },
    });
    const criteriaByName = new Map(
      existingCriteria.map((criterion) => [
        criterion.nama_kriteria,
        criterion,
      ]),
    );
    let nextCriterionCode = getMaxCriterionCode(existingCriteria) + 1;

    for (const criterion of criteria) {
      if (criteriaByName.has(criterion.name)) {
        continue;
      }

      const created = await tx.kriteria.create({
        data: {
          kode_kriteria: `C${nextCriterionCode++}`,
          nama_kriteria: criterion.name,
          bobot: criterion.weight,
          jenis: criterion.type,
        },
        select: {
          id_kriteria: true,
          kode_kriteria: true,
          nama_kriteria: true,
        },
      });
      criteriaByName.set(created.nama_kriteria, created);
    }

    for (const [index, item] of data.entries()) {
      const alternatif = await tx.alternatif.upsert({
        where: { kode_alternatif: item.nama },
        create: {
          kode_alternatif: item.nama,
          nama_alternatif: item.nama,
          provinsi: item.provinsi ?? null,
        },
        update: {
          nama_alternatif: item.nama,
          provinsi: item.provinsi ?? null,
        },
      });

      for (const [criterionName, criterionValue] of Object.entries(
        item.kriteria,
      )) {
        const criterion = criteriaByName.get(criterionName);
        if (!criterion) {
          throw new HttpError(
            `Criterion '${criterionName}' is not configured`,
            400,
          );
        }

        await tx.nilaiAlternatif.upsert({
          where: {
            id_alternatif_id_kriteria: {
              id_alternatif: alternatif.id_alternatif,
              id_kriteria: criterion.id_kriteria,
            },
          },
          create: {
            id_alternatif: alternatif.id_alternatif,
            id_kriteria: criterion.id_kriteria,
            nilai: parseCriterionValue(criterionName, criterionValue),
          },
          update: {
            nilai: parseCriterionValue(criterionName, criterionValue),
          },
        });
      }

      await tx.hasilTopsis.upsert({
        where: { id_alternatif: alternatif.id_alternatif },
        create: {
          id_alternatif: alternatif.id_alternatif,
          d_plus: item.jarak_ideal_positif,
          d_minus: item.jarak_ideal_negatif,
          nilai_preferensi: item.nilai_preferensi,
          ranking: item.ranking ?? index + 1,
          kategori: categories.get(item.nama) ?? "Rendah",
        },
        update: {
          d_plus: item.jarak_ideal_positif,
          d_minus: item.jarak_ideal_negatif,
          nilai_preferensi: item.nilai_preferensi,
          ranking: item.ranking ?? index + 1,
          kategori: categories.get(item.nama) ?? "Rendah",
        },
      });
    }

    return data.length;
  });
};

const router = Router();
router.post("/upload", authMiddleware, upload.single("file"), async (req, res) => {
  try {
    const wannaWrite = req.query.write === "true";
    if (!req.file) {
      sendError(res, new HttpError("No files uploaded", 400));
      return;
    }

    const file = req.file;
    const form = new FormData();
    const criteria = await getCriteriaForProcessing();

    form.append("criterionBody", JSON.stringify(criteria));
    form.append("file", new Blob([new Uint8Array(file.buffer)]), file.originalname);
    const calculateResult: TopsisProcessorResponseRaw = await apiPost(
      "/calculate",
      form,
    );

    if (wannaWrite) {
      await handledPrisma.handleWrite(() =>
        persistTopsisResults(calculateResult.data, criteria),
      );
    }

    sendData(res, { created: calculateResult.data.length || 0 });
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
    const criteria = await getCriteriaForProcessing();
    const insertedCount = await handledPrisma.handleWrite(() =>
      persistTopsisResults(data, criteria),
    );

    sendData(
      res,
      { insertedCount },
      "Successfully written topsis results to database",
    );
  } catch (error) {
    console.error(error);
    if (error instanceof HttpError) {
      sendError(res, error, error.status, error.message);
      return;
    }
    sendError(res, new HttpError("Unknown error occurred", 500));
  }
});

router.get("/data", async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 10;
    const sort = req.query.sortBy as string | undefined;
    const orderBy = sort
      ? ({ [sort]: "asc" } as any)
      : { id_alternatif: "asc" as const };
    const alternatif = await paginate(
      (skip, take) =>
        prisma.alternatif.findMany({
          skip,
          take,
          orderBy,
          include: {
            hasil_topsis: true,
            nilai_alternatif: {
              include: {
                kriteria: true,
              },
            },
          },
        }),
      () => prisma.alternatif.count(),
      { page, pageSize: pageSize },
    );
    sendData(res, alternatif, "Data retrieved successfully");
  } catch (error) {
    console.error(error);
    sendError(res, new HttpError("Failed to retrieve data", 500));
  }
});

export default router;
