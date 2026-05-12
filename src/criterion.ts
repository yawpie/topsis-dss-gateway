import { Router } from 'express';
import { sendData, sendError } from './utils/send';
import { createPrismaUtils, HttpError } from '@yawpie/prisma-handler';
import { prisma } from './lib/prisma';
import authMiddleware from './middlewares/authMiddleware';

const router = Router();
const handledPrisma = createPrismaUtils(prisma);
type CriterionType = "BENEFIT" | "COST";

const criteriaBodyValidator = (body: any) => {
    const { name, weight, type } = body;
    if (typeof type !== 'string') {
        throw new HttpError("Criterion type must be a string", 400);
    }
    const upperType = type.toUpperCase();
    if (upperType !== "BENEFIT" && upperType !== "COST") {
        throw new HttpError("Criterion type must be either 'BENEFIT' or 'COST'", 400);
    }
    if (!name || typeof name !== 'string') {
        throw new HttpError("Criterion name is required and must be a string", 400);
    }
    if (weight === undefined || typeof weight !== 'number') {
        throw new HttpError("Criterion weight is required and must be a number", 400);
    }
    return { name, weight, type: upperType as CriterionType };
}

router.post('/criteria', authMiddleware, async (req, res) => {
    try {
        const { name, weight, type } = criteriaBodyValidator(req.body);
        const write = await handledPrisma.handleWrite(() => prisma.criterion.create({
            data: {
                name,
                weight,
                type
            },
        }));
        sendData(res, {created: write}, "added new criterion");
    } catch (error) {
        console.error(error);
        sendError(res, error);
    }
});

router.post('/criteria/bulk', authMiddleware, async (req, res) => {
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
                    throw new HttpError(`Invalid criterion at index ${index}: ${error.message}`, 400);
                }
                throw error;
            }
        });

        const write = await handledPrisma.handleWrite(() => prisma.criterion.createMany({
            data: createdCriteria,
        }));
        sendData(res, { created: write.count }, "added new criteria");

    } catch (error) {
        console.error(error);
        sendError(res, error);
    }

});

router.patch('/criteria', authMiddleware, async (req, res) => {
    try {
        const { name, weight, type } = req.body;
        
        const validatedData = criteriaBodyValidator({ name, weight, type });
        const write = await handledPrisma.handleWrite(() => prisma.criterion.update({
            where: { name },
            data: validatedData,
        }));
        sendData(res, { updated: write }, "updated criterion");
    } catch (error) {
        console.error(error);
        sendError(res, error);
    }
});

router.patch('/criteria/bulk', authMiddleware, async (req, res) => {
    try {
        const criteria = req.body;
        if (!Array.isArray(criteria)) {
            throw new HttpError("Criteria must be an array", 400);
        }

        const updatedCriteria = criteria.map((item: any, index: number) => {
            try {
                return criteriaBodyValidator(item);
            } catch (error) {
                if (error instanceof HttpError) {
                    throw new HttpError(`Invalid criterion at index ${index}: ${error.message}`, 400);
                }
                throw error;
            }
        });

        const updatePromises = await Promise.all(updatedCriteria.map((criterion) =>
            handledPrisma.handleWrite(async () => prisma.criterion.update({
                where: { name: criterion.name },
                data: criterion,
            }))
        ));
        sendData(res, { updated: updatePromises.length }, "updated criteria");
    } catch (error) {
        console.error(error);
        sendError(res, error);
    }
});

router.delete('/criteria', authMiddleware, async (req, res) => {
    try {
        const name = req.query.name as string;
        if (!name) {
            throw new HttpError("Criterion name is required", 400);
        }
        const write = await handledPrisma.handleWrite(() => prisma.criterion.delete({
            where: { name },
        }));
        sendData(res, { deleted: write }, "deleted criterion");
    } catch (error) {
        console.error(error);
        sendError(res, error);
    }
});

export default router;