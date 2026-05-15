import { Router } from "express";
import { sendData, sendError } from "./utils/send";
import { createPrismaUtils, HttpError } from "@yawpie/prisma-handler";
import { prisma } from "./lib/prisma";
import authMiddleware from "./middlewares/authMiddleware";

const router = Router();
const handledPrisma = createPrismaUtils(prisma);
type JenisKriteriaInput = "BENEFIT" | "COST";

type CriterionInput = {
  kode_kriteria?: string;
  nama_kriteria: string;
  bobot: number;
  jenis: JenisKriteriaInput;
};

const criteriaBodyValidator = (body: any): CriterionInput => {
  const name = body.name ?? body.nama_kriteria;
  const weight = body.weight ?? body.bobot;
  const type = body.type ?? body.jenis;
  const code = body.code ?? body.kode_kriteria;

  if (typeof type !== "string") {
    throw new HttpError("Criterion type must be a string", 400);
  }
  const upperType = type.toUpperCase();
  if (upperType !== "BENEFIT" && upperType !== "COST") {
    throw new HttpError("Criterion type must be either 'BENEFIT' or 'COST'", 400);
  }
  if (!name || typeof name !== "string") {
    throw new HttpError("Criterion name is required and must be a string", 400);
  }
  if (weight === undefined || typeof weight !== "number") {
    throw new HttpError("Criterion weight is required and must be a number", 400);
  }
  if (code !== undefined && typeof code !== "string") {
    throw new HttpError("Criterion code must be a string", 400);
  }

  return {
    ...(code ? { kode_kriteria: code } : {}),
    nama_kriteria: name,
    bobot: weight,
    jenis: upperType as JenisKriteriaInput,
  };
};

const generateCriterionCodes = async (amount: number) => {
  const criteria = await prisma.kriteria.findMany({
    select: { kode_kriteria: true },
  });
  const maxCode = criteria.reduce((max, criterion) => {
    const match = /^C(\d+)$/i.exec(criterion.kode_kriteria);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  return Array.from({ length: amount }, (_, index) => `C${maxCode + index + 1}`);
};

router.post("/criteria", authMiddleware, async (req, res) => {
  try {
    const criterion = criteriaBodyValidator(req.body);
    const [generatedCode] = criterion.kode_kriteria
      ? [criterion.kode_kriteria]
      : await generateCriterionCodes(1);

    const write = await handledPrisma.handleWrite(() =>
      prisma.kriteria.create({
        data: {
          ...criterion,
          kode_kriteria: generatedCode,
        },
      }),
    );
    sendData(res, { created: write }, "added new criterion");
  } catch (error) {
    console.error(error);
    sendError(res, error);
  }
});

router.post("/criteria/bulk", authMiddleware, async (req, res) => {
  try {
    const criteria = req.body;
    if (!Array.isArray(criteria)) {
      throw new HttpError("Criteria must be an array", 400);
    }

    const createdCriteria = criteria.map((item: any, index: number) => {
      try {
        return criteriaBodyValidator(item);
      } catch (error) {
        if (error instanceof HttpError) {
          throw new HttpError(
            `Invalid criterion at index ${index}: ${error.message}`,
            400,
          );
        }
        throw error;
      }
    });

    const generatedCodes = await generateCriterionCodes(
      createdCriteria.filter((criterion) => !criterion.kode_kriteria).length,
    );
    let generatedCodeIndex = 0;
    const data = createdCriteria.map((criterion) => ({
      ...criterion,
      kode_kriteria:
        criterion.kode_kriteria ?? generatedCodes[generatedCodeIndex++],
    }));

    const write = await handledPrisma.handleWrite(() =>
      prisma.kriteria.createMany({
        data,
      }),
    );
    sendData(res, { created: write.count }, "added new criteria");
  } catch (error) {
    console.error(error);
    sendError(res, error);
  }
});

router.patch("/criteria", authMiddleware, async (req, res) => {
  try {
    const validatedData = criteriaBodyValidator(req.body);
    const write = await handledPrisma.handleWrite(() =>
      prisma.kriteria.update({
        where: { nama_kriteria: validatedData.nama_kriteria },
        data: validatedData,
      }),
    );
    sendData(res, { updated: write }, "updated criterion");
  } catch (error) {
    console.error(error);
    sendError(res, error);
  }
});

router.patch("/criteria/bulk", authMiddleware, async (req, res) => {
  try {
    const criteria = req.body as any[];
    if (!Array.isArray(criteria)) {
      throw new HttpError("Criteria must be an array", 400);
    }

    const updatedCriteria = criteria.map((item: any, index: number) => {
      try {
        return criteriaBodyValidator(item);
      } catch (error) {
        if (error instanceof HttpError) {
          throw new HttpError(
            `Invalid criterion at index ${index}: ${error.message}`,
            400,
          );
        }
        throw error;
      }
    });

    const updatePromises = await Promise.all(
      updatedCriteria.map((criterion) =>
        handledPrisma.handleWrite(async () =>
          prisma.kriteria.update({
            where: { nama_kriteria: criterion.nama_kriteria },
            data: criterion,
          }),
        ),
      ),
    );
    sendData(res, { updated: updatePromises.length }, "updated criteria");
  } catch (error) {
    console.error(error);
    sendError(res, error);
  }
});

router.delete("/criteria", authMiddleware, async (req, res) => {
  try {
    const name = req.query.name as string;
    if (!name) {
      throw new HttpError("Criterion name is required", 400);
    }
    await handledPrisma.handleWrite(() =>
      prisma.kriteria.delete({
        where: { nama_kriteria: name },
      }),
    );
    sendData(res, undefined, "deleted criterion");
  } catch (error) {
    console.error(error);
    sendError(res, error);
  }
});

router.delete("/criteria/bulk", authMiddleware, async (req, res) => {
  try {
    const names = req.body.names as any[];
    if (!Array.isArray(names) || names.some((name) => typeof name !== "string")) {
      throw new HttpError("Names must be an array of strings", 400);
    }

    const deletePromises = await Promise.all(
      names.map(
        async (name) =>
          await prisma.$transaction(async (tx) => {
            const find = await tx.kriteria.findUnique({
              where: { nama_kriteria: name },
            });
            if (!find) {
              return null;
            }
            const deleted = await tx.kriteria.delete({
              where: { nama_kriteria: name },
            });

            return deleted;
          }),
      ),
    );

    if (deletePromises.every((result) => result === null)) {
      throw new HttpError("No criteria were deleted. Please check the names and try again. (maybe they don't exist)", 404);
    }

    
    
    sendData(
      res,
      {
        deleted: deletePromises
        // .filter((v): v is NonNullable<typeof v> => !!v)
        .filter((v): v is Exclude<typeof v, null> => v !== null)
          .length,
      },
      "deleted criteria",
    );
  } catch (error) {
    console.error(error);
    sendError(res, error);
  }
});

export default router;




