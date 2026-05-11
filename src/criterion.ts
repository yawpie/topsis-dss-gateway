import { Router } from 'express';
import { sendData, sendError } from './utils/send';
import { createPrismaUtils, HttpError } from '@yawpie/prisma-handler';
import { prisma } from './lib/prisma';
import authMiddleware from './middlewares/authMiddleware';

const router = Router();
const handledPrisma = createPrismaUtils(prisma);
type CriterionType = "BENEFIT" | "COST";

router.post('/criteria', authMiddleware, async (req, res) => {
    try {
        const { name, weight, type } = req.body;
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
        const write = await handledPrisma.handleWrite(() => prisma.criterion.create({
            data: {
                name,
                weight,
                type: upperType as CriterionType,
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

        const createdCriteria = criteria.map((item, index) => {
            const { name, weight, type } = item;
            if (typeof type !== 'string') {
                throw new HttpError(`Criterion type at index ${index} must be a string`, 400);
            }
            const upperType = type.toUpperCase();
            if (upperType !== "BENEFIT" && upperType !== "COST") {
                throw new HttpError(`Criterion type at index ${index} must be either 'BENEFIT' or 'COST'`, 400);
            }
            if (!name || typeof name !== 'string') {
                throw new HttpError(`Criterion name at index ${index} is required and must be a string`, 400);
            }
            if (weight === undefined || typeof weight !== 'number') {
                throw new HttpError(`Criterion weight at index ${index} is required and must be a number`, 400);
            }
            return { name, weight, type: upperType as CriterionType };
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

// router.post('/criteria/:queryType', authMiddleware, async (req, res) => {
//     try {
//         console.log(req.cookies);
        
//         const { queryType } = req.params;
//         if (queryType === "bulk") {
//             const criteria = req.body;
//             if (!Array.isArray(criteria)) {
//                 throw new HttpError("Criteria must be an array", 400);
//             }
//             const createdCriteria = criteria.map((item, index) => {
//                 const { name, weight, type } = item;
//                 if (typeof type !== 'string') {
//                     throw new HttpError(`Criterion type at index ${index} must be a string`, 400);
//                 }
//                 const upperType = type.toUpperCase();
//                 if (upperType !== "BENEFIT" && upperType !== "COST") {
//                     throw new HttpError(`Criterion type at index ${index} must be either 'BENEFIT' or 'COST'`, 400);
//                 }
//                 if (!name || typeof name !== 'string') {
//                     throw new HttpError(`Criterion name at index ${index} is required and must be a string`, 400);
//                 }
//                 if (weight === undefined || typeof weight !== 'number') {
//                     throw new HttpError(`Criterion weight at index ${index} is required and must be a number`, 400);
//                 }
//                 return { name, weight, type: upperType as CriterionType };
//             }
//             );
//             const write = await handledPrisma.handleWrite(() => prisma.criterion.createMany({
//                 data: createdCriteria,
//             }));
//             sendData(res, { created: write.count }, "added new criteria");
//         } else if (queryType === "single") {
//             const { name, weight, type } = req.body;
//             if (typeof type !== 'string') {
//                 throw new HttpError("Criterion type must be a string", 400);
//             }
//             const upperType = type.toUpperCase();
//             if (upperType !== "BENEFIT" && upperType !== "COST") {
//                 throw new HttpError("Criterion type must be either 'BENEFIT' or 'COST'", 400);
//             }
//             if (!name || typeof name !== 'string') {
//                 throw new HttpError("Criterion name is required and must be a string", 400);
//             }
//             if (weight === undefined || typeof weight !== 'number') {
//                 throw new HttpError("Criterion weight is required and must be a number", 400);
//             }
//             const write = await handledPrisma.handleWrite(() => prisma.criterion.create({
//                 data: {
//                     name,
//                     weight,
//                     type: upperType as CriterionType,
//                 },
//             }));
//             sendData(res, { created: write }, "added new criterion");
//         } else {
//             throw new HttpError("Invalid query type. Must be either 'single' or 'bulk'", 400);
//         }

//         } catch (error) {
//             console.error(error);
//             sendError(res, error);
//         }

// });

export default router;