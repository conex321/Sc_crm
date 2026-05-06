import { notFound } from "next/navigation";
import { ContactForm } from "@/components/crm/contact-form";
import { updateContact } from "../../actions";
import { getContact } from "@/lib/crm/contacts";

export default async function EditContactPage(props: {
  params: Promise<{ id: string; contactId: string }>;
}) {
  const { id, contactId } = await props.params;
  const contact = await getContact(contactId);
  if (!contact) notFound();
  const action = updateContact.bind(null, id, contactId);
  return (
    <div className="px-6 py-5">
      <h1 className="mb-3 text-lg font-semibold tracking-tight">
        Edit contact · {contact.first_name} {contact.last_name}
      </h1>
      <ContactForm
        accountId={id}
        contact={contact}
        action={action}
        submitLabel="Save changes"
      />
    </div>
  );
}
