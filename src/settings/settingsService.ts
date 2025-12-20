import prisma from "../prisma.js";

export async function getOrCreateUserSettings(userId: string) {
  let settings = await prisma.userSetting.findUnique({
    where: { userId }
  });

  if (!settings) {
    settings = await prisma.userSetting.create({
      data: { userId }
    });
  }

  return settings;
}
