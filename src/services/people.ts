import { google, type people_v1, type Auth } from "googleapis";

export interface Contact {
  resourceName: string;
  etag?: string;
  displayName?: string;
  givenName?: string;
  familyName?: string;
  emails?: Array<{ value: string; type?: string }>;
  phoneNumbers?: Array<{ value: string; type?: string }>;
  addresses?: Array<{
    formattedValue?: string;
    type?: string;
    streetAddress?: string;
    city?: string;
    region?: string;
    postalCode?: string;
    country?: string;
  }>;
  organizations?: Array<{
    name?: string;
    title?: string;
    department?: string;
  }>;
  birthdays?: Array<{ date?: { year?: number; month?: number; day?: number } }>;
  notes?: string;
  photos?: Array<{ url?: string }>;
  memberships?: Array<{ contactGroupResourceName: string }>;
}

export interface ContactGroup {
  resourceName: string;
  etag?: string;
  name: string;
  memberCount?: number;
  groupType?: string;
}

export interface CreateContactOptions {
  givenName: string;
  familyName?: string;
  emails?: Array<{ value: string; type?: string }>;
  phoneNumbers?: Array<{ value: string; type?: string }>;
  organization?: { name?: string; title?: string };
  notes?: string;
}

export interface UpdateContactOptions {
  resourceName: string;
  etag: string;
  givenName?: string;
  familyName?: string;
  emails?: Array<{ value: string; type?: string }>;
  phoneNumbers?: Array<{ value: string; type?: string }>;
  organization?: { name?: string; title?: string };
  notes?: string;
}

export class PeopleService {
  private readonly people: people_v1.People;

  constructor(authClient: Auth.OAuth2Client) {
    this.people = google.people({ version: "v1", auth: authClient });
  }

  // Contacts

  public async listContacts(options: {
    pageSize?: number;
    pageToken?: string;
    sortOrder?: "LAST_MODIFIED_ASCENDING" | "LAST_MODIFIED_DESCENDING" | "FIRST_NAME_ASCENDING" | "LAST_NAME_ASCENDING";
  } = {}): Promise<{ contacts: Contact[]; nextPageToken?: string }> {
    const response = await this.people.people.connections.list({
      resourceName: "people/me",
      pageSize: options.pageSize || 100,
      pageToken: options.pageToken,
      sortOrder: options.sortOrder || "LAST_NAME_ASCENDING",
      personFields: "names,emailAddresses,phoneNumbers,addresses,organizations,birthdays,biographies,photos,memberships",
    });

    const contacts: Contact[] = (response.data.connections || []).map((person) =>
      this.formatContact(person)
    );

    return {
      contacts,
      nextPageToken: response.data.nextPageToken || undefined,
    };
  }

  public async getContact(resourceName: string): Promise<Contact> {
    const response = await this.people.people.get({
      resourceName,
      personFields: "names,emailAddresses,phoneNumbers,addresses,organizations,birthdays,biographies,photos,memberships",
    });

    return this.formatContact(response.data);
  }

  public async searchContacts(query: string, maxResults = 30): Promise<Contact[]> {
    const response = await this.people.people.searchContacts({
      query,
      readMask: "names,emailAddresses,phoneNumbers,addresses,organizations,birthdays,biographies,photos,memberships",
      pageSize: maxResults,
    });

    return (response.data.results || [])
      .filter((r) => r.person)
      .map((r) => this.formatContact(r.person!));
  }

  public async createContact(options: CreateContactOptions): Promise<Contact> {
    const person: people_v1.Schema$Person = {
      names: [
        {
          givenName: options.givenName,
          familyName: options.familyName,
        },
      ],
    };

    if (options.emails) {
      person.emailAddresses = options.emails.map((e) => ({
        value: e.value,
        type: e.type || "home",
      }));
    }

    if (options.phoneNumbers) {
      person.phoneNumbers = options.phoneNumbers.map((p) => ({
        value: p.value,
        type: p.type || "mobile",
      }));
    }

    if (options.organization) {
      person.organizations = [
        {
          name: options.organization.name,
          title: options.organization.title,
        },
      ];
    }

    if (options.notes) {
      person.biographies = [{ value: options.notes, contentType: "TEXT_PLAIN" }];
    }

    const response = await this.people.people.createContact({
      requestBody: person,
      personFields: "names,emailAddresses,phoneNumbers,addresses,organizations,birthdays,biographies,photos,memberships",
    });

    return this.formatContact(response.data);
  }

  public async updateContact(options: UpdateContactOptions): Promise<Contact> {
    const person: people_v1.Schema$Person = {
      etag: options.etag,
    };

    const updatePersonFields: string[] = [];

    if (options.givenName || options.familyName) {
      person.names = [
        {
          givenName: options.givenName,
          familyName: options.familyName,
        },
      ];
      updatePersonFields.push("names");
    }

    if (options.emails) {
      person.emailAddresses = options.emails.map((e) => ({
        value: e.value,
        type: e.type || "home",
      }));
      updatePersonFields.push("emailAddresses");
    }

    if (options.phoneNumbers) {
      person.phoneNumbers = options.phoneNumbers.map((p) => ({
        value: p.value,
        type: p.type || "mobile",
      }));
      updatePersonFields.push("phoneNumbers");
    }

    if (options.organization) {
      person.organizations = [
        {
          name: options.organization.name,
          title: options.organization.title,
        },
      ];
      updatePersonFields.push("organizations");
    }

    if (options.notes !== undefined) {
      person.biographies = [{ value: options.notes, contentType: "TEXT_PLAIN" }];
      updatePersonFields.push("biographies");
    }

    const response = await this.people.people.updateContact({
      resourceName: options.resourceName,
      updatePersonFields: updatePersonFields.join(","),
      requestBody: person,
      personFields: "names,emailAddresses,phoneNumbers,addresses,organizations,birthdays,biographies,photos,memberships",
    });

    return this.formatContact(response.data);
  }

  public async deleteContact(resourceName: string): Promise<void> {
    await this.people.people.deleteContact({
      resourceName,
    });
  }

  // Contact Groups

  public async listContactGroups(): Promise<ContactGroup[]> {
    const response = await this.people.contactGroups.list({
      pageSize: 100,
    });

    return (response.data.contactGroups || []).map((group) => ({
      resourceName: group.resourceName || "",
      etag: group.etag || undefined,
      name: group.name || "",
      memberCount: group.memberCount || undefined,
      groupType: group.groupType || undefined,
    }));
  }

  public async getContactGroup(resourceName: string): Promise<ContactGroup & { members?: Contact[] }> {
    const response = await this.people.contactGroups.get({
      resourceName,
      maxMembers: 100,
    });

    const members: Contact[] = [];
    if (response.data.memberResourceNames) {
      for (const memberName of response.data.memberResourceNames) {
        try {
          const contact = await this.getContact(memberName);
          members.push(contact);
        } catch {
          // Skip if contact can't be retrieved
        }
      }
    }

    return {
      resourceName: response.data.resourceName || "",
      etag: response.data.etag || undefined,
      name: response.data.name || "",
      memberCount: response.data.memberCount || undefined,
      groupType: response.data.groupType || undefined,
      members: members.length > 0 ? members : undefined,
    };
  }

  public async createContactGroup(name: string): Promise<ContactGroup> {
    const response = await this.people.contactGroups.create({
      requestBody: {
        contactGroup: { name },
      },
    });

    return {
      resourceName: response.data.resourceName || "",
      etag: response.data.etag || undefined,
      name: response.data.name || "",
      memberCount: response.data.memberCount || undefined,
      groupType: response.data.groupType || undefined,
    };
  }

  public async deleteContactGroup(resourceName: string): Promise<void> {
    await this.people.contactGroups.delete({
      resourceName,
      deleteContacts: false,
    });
  }

  // Other People directory (for workspace users)

  public async searchDirectory(query: string, maxResults = 30): Promise<Contact[]> {
    try {
      const response = await this.people.people.searchDirectoryPeople({
        query,
        readMask: "names,emailAddresses,phoneNumbers,addresses,organizations,photos",
        pageSize: maxResults,
        sources: ["DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE"],
      });

      return (response.data.people || []).map((person) => this.formatContact(person));
    } catch {
      // Directory search may not be available for non-workspace accounts
      return [];
    }
  }

  // Helper to get "Other Contacts" (contacts from Gmail interactions)

  public async listOtherContacts(pageSize = 100, pageToken?: string): Promise<{
    contacts: Contact[];
    nextPageToken?: string;
  }> {
    const response = await this.people.otherContacts.list({
      pageSize,
      pageToken,
      readMask: "names,emailAddresses,phoneNumbers",
    });

    const contacts: Contact[] = (response.data.otherContacts || []).map((person) =>
      this.formatContact(person)
    );

    return {
      contacts,
      nextPageToken: response.data.nextPageToken || undefined,
    };
  }

  private formatContact(person: people_v1.Schema$Person): Contact {
    const primaryName = person.names?.[0];
    const primaryBio = person.biographies?.[0];

    return {
      resourceName: person.resourceName || "",
      etag: person.etag || undefined,
      displayName: primaryName?.displayName || undefined,
      givenName: primaryName?.givenName || undefined,
      familyName: primaryName?.familyName || undefined,
      emails: person.emailAddresses?.map((e) => ({
        value: e.value || "",
        type: e.type || undefined,
      })),
      phoneNumbers: person.phoneNumbers?.map((p) => ({
        value: p.value || "",
        type: p.type || undefined,
      })),
      addresses: person.addresses?.map((a) => ({
        formattedValue: a.formattedValue || undefined,
        type: a.type || undefined,
        streetAddress: a.streetAddress || undefined,
        city: a.city || undefined,
        region: a.region || undefined,
        postalCode: a.postalCode || undefined,
        country: a.country || undefined,
      })),
      organizations: person.organizations?.map((o) => ({
        name: o.name || undefined,
        title: o.title || undefined,
        department: o.department || undefined,
      })),
      birthdays: person.birthdays?.map((b) => ({
        date: b.date
          ? {
              year: b.date.year || undefined,
              month: b.date.month || undefined,
              day: b.date.day || undefined,
            }
          : undefined,
      })),
      notes: primaryBio?.value || undefined,
      photos: person.photos?.map((p) => ({ url: p.url || undefined })),
      memberships: person.memberships
        ?.filter((m) => m.contactGroupMembership?.contactGroupResourceName)
        .map((m) => ({ contactGroupResourceName: m.contactGroupMembership!.contactGroupResourceName! })),
    };
  }
}

