
import { z } from "zod";

export const updateBankSchema = z
  .object({
    name: z.string().trim().min(1, "Le nom est requis").max(150),
    address: z.string().trim().min(1, "L'adresse est requise").max(255),
    phone: z.string().trim().min(1, "Le téléphone est requis").max(30),
    email: z.string().trim().email("Adresse e-mail invalide").max(255),
  })
  .strict();
