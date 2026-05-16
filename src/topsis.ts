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
  kode_alternatif?: string;
  metadata?: string | null;
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
      const kategori =
        ratio < 0.3 ? "Tinggi" : ratio < 0.7 ? "Sedang" : "Rendah";
      //todo ganti item.nama dengan kode_alternatif yang harus ada di tiap request (mungkin gunakan middleware untuk validasi dan bikin jika tidak ada di body)
      return [item.kode_alternatif || item.nama, kategori];
    }),
  );
};

const parseCriterionValue = (criterionName: string, value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new HttpError(`Invalid value for criterion '${criterionName}'`, 400);
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

  /** Resolve the unique identifier for an item (prefers kode_alternatif, falls back to nama). */
  const resolveCode = (item: TopsisDataResult): string => {
    const code = item.kode_alternatif || item.nama;
    if (!code) {
      throw new HttpError(
        "Item harus memiliki 'kode_alternatif' atau 'nama' sebagai identifier",
        400,
      );
    }
    return code;
  };

  return prisma.$transaction(async (tx) => {
    // 1. Handle criteria - batch operation
    const existingCriteria = await tx.kriteria.findMany({
      select: {
        id_kriteria: true,
        kode_kriteria: true,
        nama_kriteria: true,
      },
    });
    const criteriaByName = new Map(
      existingCriteria.map((criterion) => [criterion.nama_kriteria, criterion]),
    );
    let nextCriterionCode = getMaxCriterionCode(existingCriteria) + 1;

    // Create missing criteria in batch
    const newCriteria = criteria.filter((c) => !criteriaByName.has(c.name));
    if (newCriteria.length > 0) {
      await tx.kriteria.createMany({
        data: newCriteria.map((c, idx) => ({
          kode_kriteria: `C${nextCriterionCode + idx}`,
          nama_kriteria: c.name,
          bobot: c.weight,
          jenis: c.type,
        })),
      });
    }

    // Refresh criteria map with all criteria
    const allCriteria = await tx.kriteria.findMany({
      select: {
        id_kriteria: true,
        kode_kriteria: true,
        nama_kriteria: true,
      },
    });
    const criteriaMap = new Map(
      allCriteria.map((criterion) => [criterion.nama_kriteria, criterion]),
    );

    // 2. Batch upsert alternatif - 1 query
    const alternatifCodes = data.map(resolveCode);
    const existingAlternatif = await tx.alternatif.findMany({
      where: { kode_alternatif: { in: alternatifCodes } },
      select: { id_alternatif: true, kode_alternatif: true },
    });
    const existingAlternatifMap = new Map(
      existingAlternatif.map((a) => [a.kode_alternatif, a.id_alternatif]),
    );

    // Create new alternatif
    const newAlternatifData = data
      .filter((item) => !existingAlternatifMap.has(resolveCode(item)))
      .map((item) => {
        const code = resolveCode(item);
        return {
          kode_alternatif: code,
          nama_alternatif: item.nama || code,
          metadata: item.metadata ?? null,
        };
      });

    if (newAlternatifData.length > 0) {
      await tx.alternatif.createMany({
        data: newAlternatifData,
      });
    }

    // Get updated alternatif map
    const allAlternatif = await tx.alternatif.findMany({
      where: { kode_alternatif: { in: alternatifCodes } },
      select: { id_alternatif: true, kode_alternatif: true },
    });
    const alternatifMap = new Map(
      allAlternatif.map((a) => [a.kode_alternatif, a.id_alternatif]),
    );

    // Update existing alternatif (if needed)
    for (const item of data) {
      const code = resolveCode(item);
      const alternatifId = alternatifMap.get(code);
      if (alternatifId && existingAlternatifMap.has(code)) {
        await tx.alternatif.update({
          where: { id_alternatif: alternatifId },
          data: {
            nama_alternatif: item.nama || code,
            metadata: item.metadata ?? null,
          },
        });
      }
    }

    // 3. Batch upsert nilai_alternatif - 1 query
    const nilaiAlternatifData = [];
    for (const item of data) {
      const code = resolveCode(item);
      const alternatifId = alternatifMap.get(code);
      if (!alternatifId) continue;

      for (const [criterionName, criterionValue] of Object.entries(
        item.kriteria,
      )) {
        const criterion = criteriaMap.get(criterionName);
        if (!criterion) {
          throw new HttpError(
            `Criterion '${criterionName}' is not configured`,
            400,
          );
        }

        nilaiAlternatifData.push({
          id_alternatif: alternatifId,
          id_kriteria: criterion.id_kriteria,
          nilai: parseCriterionValue(criterionName, criterionValue),
        });
      }
    }

    // Delete old nilai_alternatif for these alternatif and insert new ones
    const alternatifIds = Array.from(alternatifMap.values());
    if (alternatifIds.length > 0 && nilaiAlternatifData.length > 0) {
      await tx.nilaiAlternatif.deleteMany({
        where: { id_alternatif: { in: alternatifIds } },
      });
      await tx.nilaiAlternatif.createMany({
        data: nilaiAlternatifData,
      });
    }

    // 4. Batch upsert hasil_topsis - 1 query
    const hasilTopsisData = data.map((item, index) => {
      const code = resolveCode(item);
      const alternatifId = alternatifMap.get(code);
      if (!alternatifId) {
        throw new HttpError(`Alternatif '${code}' not found`, 500);
      }
      return {
        id_alternatif: alternatifId,
        d_plus: item.jarak_ideal_positif,
        d_minus: item.jarak_ideal_negatif,
        nilai_preferensi: item.nilai_preferensi,
        ranking: item.ranking ?? index + 1,
        kategori: categories.get(code) ?? "Rendah",
      };
    });

    // Delete old hasil_topsis and insert new ones
    if (alternatifIds.length > 0) {
      await tx.hasilTopsis.deleteMany({
        where: { id_alternatif: { in: alternatifIds } },
      });
    }
    if (hasilTopsisData.length > 0) {
      await tx.hasilTopsis.createMany({
        data: hasilTopsisData,
      });
    }

    return data.length;
  });
};

const router = Router();
router.post(
  "/upload",
  authMiddleware,
  upload.single("file"),
  async (req, res) => {
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
      form.append(
        "file",
        new Blob([new Uint8Array(file.buffer)]),
        file.originalname,
      );
      const calculateResult: TopsisProcessorResponseRaw = await apiPost(
        "/calculate",
        form,
      );

      if (wannaWrite) {
        await handledPrisma.handleWrite(() =>
          persistTopsisResults(calculateResult.data, criteria),
        );
        sendData(res, { created: calculateResult.data.length || 0 });
      } else {
        sendData(res, { data: calculateResult.data });
      }
    } catch (error) {
      console.error(error);
      if (error instanceof HttpError) {
        sendError(res, error, error.status, error.message);
        return;
      }
      sendError(res, error);
    }
  },
);

/**
 * POST /item
 * Menambahkan satu item alternatif beserta nilai kriterianya ke database.
 *
 * Body:
 * {
 *   "nama": string,
 *   "kode_alternatif"?: string,
 *   "metadata"?: string,
 *   "kriteria": { [nama_kriteria]: number }
 * }
 */
router.post("/item", authMiddleware, async (req, res) => {
  try {
    const { nama, kode_alternatif, metadata, kriteria } = req.body;

    if (!nama || typeof nama !== "string") {
      sendError(res, new HttpError("Field 'nama' wajib diisi", 400));
      return;
    }

    if (!kriteria || typeof kriteria !== "object" || Array.isArray(kriteria)) {
      sendError(
        res,
        new HttpError(
          "Field 'kriteria' wajib berupa object { nama_kriteria: nilai }",
          400,
        ),
      );
      return;
    }

    // Validate that all criteria values are numeric
    for (const [key, value] of Object.entries(kriteria)) {
      parseCriterionValue(key, value);
    }

    const kode = kode_alternatif || nama;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Upsert alternatif
      const alternatif = await tx.alternatif.upsert({
        where: { kode_alternatif: kode },
        update: {
          nama_alternatif: nama,
          metadata: metadata ?? null,
        },
        create: {
          kode_alternatif: kode,
          nama_alternatif: nama,
          metadata: metadata ?? null,
        },
      });

      // 2. Ensure all criteria exist in DB
      const existingCriteria = await tx.kriteria.findMany({
        select: {
          id_kriteria: true,
          kode_kriteria: true,
          nama_kriteria: true,
        },
      });
      const criteriaByName = new Map(
        existingCriteria.map((c) => [c.nama_kriteria, c]),
      );
      let nextCode = getMaxCriterionCode(existingCriteria) + 1;

      const criteriaNames = Object.keys(kriteria);
      const newCriteriaNames = criteriaNames.filter(
        (name) => !criteriaByName.has(name),
      );

      if (newCriteriaNames.length > 0) {
        // Look up default criteria config for weight/type when creating new criteria
        const criteriaConfig = await getCriteriaForProcessing();
        const configMap = new Map(
          criteriaConfig.map((c) => [c.name, c]),
        );

        await tx.kriteria.createMany({
          data: newCriteriaNames.map((name, idx) => {
            const config = configMap.get(name);
            return {
              kode_kriteria: `C${nextCode + idx}`,
              nama_kriteria: name,
              bobot: config?.weight ?? 0,
              jenis: config?.type ?? "BENEFIT",
            };
          }),
        });
      }

      // Refresh criteria map
      const allCriteria = await tx.kriteria.findMany({
        select: {
          id_kriteria: true,
          nama_kriteria: true,
        },
      });
      const criteriaMap = new Map(
        allCriteria.map((c) => [c.nama_kriteria, c]),
      );

      // 3. Upsert nilai_alternatif for each criterion
      const nilaiData = [];
      for (const [criterionName, value] of Object.entries(kriteria)) {
        const criterion = criteriaMap.get(criterionName);
        if (!criterion) {
          throw new HttpError(
            `Criterion '${criterionName}' is not configured`,
            400,
          );
        }
        nilaiData.push({
          id_alternatif: alternatif.id_alternatif,
          id_kriteria: criterion.id_kriteria,
          nilai: parseCriterionValue(criterionName, value),
        });
      }

      // Delete old values and insert new ones
      await tx.nilaiAlternatif.deleteMany({
        where: { id_alternatif: alternatif.id_alternatif },
      });
      if (nilaiData.length > 0) {
        await tx.nilaiAlternatif.createMany({ data: nilaiData });
      }

      return alternatif;
    });

    sendData(res, { data: result }, "Item berhasil ditambahkan", 201);
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
 * POST /calculate
 * Mengambil semua alternatif dari database, mengirimkannya ke topsis-processor
 * untuk dihitung, lalu menyimpan hasilnya ke database.
 *
 * Query:
 *   write=true  -> simpan hasil ke database (default: true)
 *   write=false -> hanya return hasil perhitungan tanpa menyimpan
 */
router.post("/calculate", authMiddleware, async (req, res) => {
  try {
    const wannaWrite = req.query.write !== "false";

    // 1. Ambil semua alternatif beserta nilai kriterianya dari database
    const alternatives = await prisma.alternatif.findMany({
      include: {
        nilai_alternatif: {
          include: {
            kriteria: true,
          },
        },
      },
    });

    if (alternatives.length === 0) {
      sendError(
        res,
        new HttpError(
          "Tidak ada data alternatif di database. Tambahkan item terlebih dahulu.",
          400,
        ),
      );
      return;
    }

    // 2. Ambil konfigurasi kriteria
    const criteria = await getCriteriaForProcessing();

    // 3. Transform data ke format yang diharapkan oleh topsis-processor
    const alternativesPayload = alternatives.map((alt) => {
      const kriteriaValues: Record<string, number> = {};
      for (const nilai of alt.nilai_alternatif) {
        kriteriaValues[nilai.kriteria.nama_kriteria] = Number(nilai.nilai);
      }
      return {
        nama: alt.nama_alternatif ?? alt.kode_alternatif,
        kode_alternatif: alt.kode_alternatif,
        metadata: alt.metadata,
        kriteria: kriteriaValues,
      };
    });

    // 4. Kirim ke topsis-processor /calculate-json
    const calculateResult: TopsisProcessorResponseRaw = await apiPost(
      "/calculate-json",
      {
        alternatives: alternativesPayload,
        criteria,
      },
    );

    // 5. Simpan atau return hasil
    if (wannaWrite) {
      await handledPrisma.handleWrite(() =>
        persistTopsisResults(calculateResult.data, criteria),
      );
      sendData(res, { created: calculateResult.data.length || 0 });
    } else {
      sendData(res, { data: calculateResult.data });
    }
  } catch (error) {
    console.error(error);
    if (error instanceof HttpError) {
      sendError(res, error, error.status, error.message);
      return;
    }
    sendError(res, error);
  }
});

router.get("/data", async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 10;
    const sort = req.query.sortBy as string | undefined;
    const verbose = req.query.verbose === "true";
    const orderBy = sort
      ? ({ [sort]: "asc" } as any)
      : { id_alternatif: "asc" as const };

    const alternatif = await paginate(
      (skip, take) =>
        prisma.alternatif.findMany({
          skip,
          take,
          orderBy,
          include: verbose
            ? {
                hasil_topsis: true,
                nilai_alternatif: {
                  include: {
                    kriteria: true,
                  },
                },
              }
            : {
                hasil_topsis: {
                  select: {
                    nilai_preferensi: true,
                    ranking: true,
                    kategori: true,
                  },
                },
              },
        }),
      () => prisma.alternatif.count(),
      { page, pageSize: pageSize },
    );

    if (verbose) {
      sendData(res, alternatif, "Data retrieved successfully");
      return;
    }

    sendData(res, {
      ...alternatif,
      data: alternatif.data.map((item) => ({
        kode_alternatif: item.kode_alternatif,
        nama_alternatif: item.nama_alternatif,
        hasil_topsis: item.hasil_topsis
          ? {
              nilai_preferensi: item.hasil_topsis.nilai_preferensi,
              ranking: item.hasil_topsis.ranking,
              kategori: item.hasil_topsis.kategori,
            }
          : null,
      })),
    });
  } catch (error) {
    console.error(error);
    sendError(res, new HttpError("Failed to retrieve data", 500));
  }
});

export default router;

