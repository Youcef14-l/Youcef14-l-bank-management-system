
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Building2, MapPin, Phone, Mail, Save } from "lucide-react";

import { getBank, updateBank } from "../lib/bankApi.js";
import "./utils/BankSettingsPage.css";

const bankSchema = z.object({
  name: z.string().trim().min(1, "Le nom est obligatoire").max(150),
  address: z.string().trim().min(1, "L'adresse est obligatoire").max(255),
  phone: z.string().trim().min(1, "Le téléphone est obligatoire").max(30),
  email: z.string().trim().email("Adresse e-mail invalide").max(255),
});

const fields = [
  {
    name: "name",
    label: "Nom de la banque",
    icon: Building2,
    placeholder: "Nom de la banque",
  },
  {
    name: "address",
    label: "Adresse",
    icon: MapPin,
    placeholder: "Adresse de la banque",
  },
  {
    name: "phone",
    label: "Téléphone",
    icon: Phone,
    placeholder: "Numéro de téléphone",
  },
  {
    name: "email",
    label: "Adresse e-mail",
    icon: Mail,
    placeholder: "contact@example.com",
  },
];

export default function BankSettingsPage({ onBankUpdated }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [success, setSuccess] = useState("");

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(bankSchema),
    defaultValues: {
      name: "",
      address: "",
      phone: "",
      email: "",
    },
  });

  useEffect(() => {
    let active = true;

    async function loadBank() {
      try {
        const bank = await getBank();

        if (!active) return;

        reset({
          name: bank.name ?? "",
          address: bank.address ?? "",
          phone: bank.phone ?? "",
          email: bank.email ?? "",
        });
      } catch (error) {
        if (active) {
          setLoadError(error.message || "Impossible de charger les informations.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadBank();

    return () => {
      active = false;
    };
  }, [reset]);

  const onSubmit = async (values) => {
    setSuccess("");
    setLoadError("");

    try {
      const updatedBank = await updateBank(values);

      reset({
        name: updatedBank.name,
        address: updatedBank.address,
        phone: updatedBank.phone,
        email: updatedBank.email,
      });

      onBankUpdated?.(updatedBank);
      setSuccess("Les informations de la banque ont été mises à jour.");
    } catch (error) {
      setLoadError(error.message || "Une erreur est survenue.");
    }
  };

  if (loading) {
    return <div className="bank-settings-loading">Chargement des informations...</div>;
  }

  if (loadError && !success && !errors) {
    return <div className="bank-settings-alert error">{loadError}</div>;
  }

  return (
    <section className="bank-settings-page">
      <div className="bank-settings-heading">
        <div>
          <h1>Paramètres de la banque</h1>
          <p>
            Consultez et modifiez les informations générales de votre banque.
          </p>
        </div>
        <div className="bank-settings-heading-icon">
          <Building2 size={25} />
        </div>
      </div>

      {loadError && (
        <div className="bank-settings-alert error">{loadError}</div>
      )}

      {success && (
        <div className="bank-settings-alert success">{success}</div>
      )}

      <form
        className="bank-settings-card"
        onSubmit={handleSubmit(onSubmit)}
      >
        <div className="bank-settings-card-heading">
          <div>
            <h2>Informations générales</h2>
            <p>Ces informations sont enregistrées dans la base de données.</p>
          </div>
        </div>

        <div className="bank-settings-grid">
          {fields.map(({ name, label, icon: Icon, placeholder }) => (
            <div className="bank-settings-field" key={name}>
              <label htmlFor={name}>{label}</label>

              <div className="bank-settings-input">
                <Icon size={17} />
                <input
                  id={name}
                  type={name === "email" ? "email" : "text"}
                  placeholder={placeholder}
                  {...register(name)}
                />
              </div>

              {errors[name] && (
                <span className="bank-settings-field-error">
                  {errors[name].message}
                </span>
              )}
            </div>
          ))}
        </div>

        <div className="bank-settings-footer">
          <p>Le code et l'identifiant de la banque ne sont pas modifiables.</p>

          <button
            type="submit"
            className="bank-settings-save"
            disabled={isSubmitting}
          >
            <Save size={17} />
            {isSubmitting ? "Enregistrement..." : "Enregistrer les modifications"}
          </button>
        </div>
      </form>
    </section>
  );
}
