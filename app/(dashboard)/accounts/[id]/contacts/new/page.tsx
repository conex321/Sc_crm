import { ContactForm } from "@/components/crm/contact-form";
import { createContact } from "../actions";

export default async function NewContactPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const action = createContact.bind(null, id);
  return (
    <div className="px-6 py-5">
      <h1 className="mb-3 text-lg font-semibold tracking-tight">New contact</h1>
      <ContactForm
        accountId={id}
        action={action}
        submitLabel="Add contact"
      />
    </div>
  );
}
