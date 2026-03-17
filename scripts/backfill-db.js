import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function backfill() {
    // await prisma.$executeRawUnsafe(`
    //     UPDATE "campaign"
    //     SET "replyTo" = "fromEmail"
    //     WHERE ("replyTo" IS NULL OR "replyTo" = '')
    //       AND "fromEmail" IS NOT NULL
    //       AND "fromEmail" <> ''
    //   `)
// console.log('DB URL:', process.env.DATABASE_URL)
}

backfill()
  .then(() => prisma.$disconnect())
  .catch(e => {
    console.error(e)
    prisma.$disconnect()
  })
