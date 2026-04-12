import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Auth } from "googleapis";

const mockConnectionsList = vi.fn();
const mockContactGroupsList = vi.fn();
const mockContactGroupsGet = vi.fn();
const mockContactGroupsCreate = vi.fn();
const mockContactGroupsDelete = vi.fn();
const mockContactGroupsMembersModify = vi.fn();
const mockPeopleGet = vi.fn();
const mockPeopleCreateContact = vi.fn();
const mockPeopleUpdateContact = vi.fn();
const mockPeopleDeleteContact = vi.fn();
const mockPeopleSearchContacts = vi.fn();
const mockPeopleSearchDirectoryPeople = vi.fn();
const mockOtherContactsList = vi.fn();

vi.mock("googleapis", () => ({
  google: {
    people: () => ({
      people: {
        connections: { list: mockConnectionsList },
        get: mockPeopleGet,
        createContact: mockPeopleCreateContact,
        updateContact: mockPeopleUpdateContact,
        deleteContact: mockPeopleDeleteContact,
        searchContacts: mockPeopleSearchContacts,
        searchDirectoryPeople: mockPeopleSearchDirectoryPeople,
      },
      contactGroups: {
        list: mockContactGroupsList,
        get: mockContactGroupsGet,
        create: mockContactGroupsCreate,
        delete: mockContactGroupsDelete,
        members: { modify: mockContactGroupsMembersModify },
      },
      otherContacts: {
        list: mockOtherContactsList,
      },
    }),
  },
}));

import { PeopleService } from "../services/people.js";

describe("PeopleService", () => {
  let service: PeopleService;
  const mockAuth = {} as Auth.OAuth2Client;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PeopleService(mockAuth);
  });

  describe("listContacts", () => {
    it("should list contacts", async () => {
      mockConnectionsList.mockResolvedValue({
        data: {
          connections: [
            {
              resourceName: "people/c123",
              names: [{ displayName: "John Doe", givenName: "John", familyName: "Doe" }],
              emailAddresses: [{ value: "john@example.com", type: "work" }],
              phoneNumbers: [{ value: "555-1234", type: "mobile" }],
            },
          ],
          nextPageToken: "token",
          totalPeople: 100,
        },
      });

      const result = await service.listContacts();

      expect(result.contacts).toHaveLength(1);
      expect(result.contacts[0].displayName).toBe("John Doe");
      expect(result.nextPageToken).toBe("token");
    });

    it("should handle empty contacts", async () => {
      mockConnectionsList.mockResolvedValue({ data: { connections: null } });

      const result = await service.listContacts();

      expect(result.contacts).toHaveLength(0);
    });
  });

  describe("getContact", () => {
    it("should get contact by resource name", async () => {
      mockPeopleGet.mockResolvedValue({
        data: {
          resourceName: "people/c123",
          names: [{ displayName: "Jane Doe" }],
          emailAddresses: [{ value: "jane@example.com" }],
        },
      });

      const result = await service.getContact("people/c123");

      expect(result.displayName).toBe("Jane Doe");
      expect(result.emails?.[0].value).toBe("jane@example.com");
    });
  });

  describe("createContact", () => {
    it("should create contact", async () => {
      mockPeopleCreateContact.mockResolvedValue({
        data: {
          resourceName: "people/c456",
          names: [{ displayName: "New Contact", givenName: "New", familyName: "Contact" }],
        },
      });

      const result = await service.createContact({
        givenName: "New",
        familyName: "Contact",
        emails: [{ value: "new@example.com" }],
        phoneNumbers: [{ value: "555-5678" }],
      });

      expect(mockPeopleCreateContact).toHaveBeenCalled();
      expect(result.resourceName).toBe("people/c456");
    });
  });

  describe("updateContact", () => {
    it("should update contact", async () => {
      mockPeopleUpdateContact.mockResolvedValue({
        data: {
          resourceName: "people/c123",
          names: [{ displayName: "Updated Name", givenName: "Updated", familyName: "Name" }],
        },
      });

      const result = await service.updateContact({
        resourceName: "people/c123",
        etag: "etag123",
        givenName: "Updated",
        familyName: "Name",
      });

      expect(result.displayName).toBe("Updated Name");
    });
  });

  describe("deleteContact", () => {
    it("should delete contact", async () => {
      mockPeopleDeleteContact.mockResolvedValue({});

      await service.deleteContact("people/c123");

      expect(mockPeopleDeleteContact).toHaveBeenCalledWith({
        resourceName: "people/c123",
      });
    });
  });

  describe("searchContacts", () => {
    it("should search contacts", async () => {
      mockPeopleSearchContacts.mockResolvedValue({
        data: {
          results: [
            { person: { resourceName: "people/c123", names: [{ displayName: "John" }] } },
          ],
        },
      });

      const result = await service.searchContacts("John");

      expect(result).toHaveLength(1);
      expect(result[0].displayName).toBe("John");
    });

    it("should handle empty search results", async () => {
      mockPeopleSearchContacts.mockResolvedValue({ data: { results: null } });

      const result = await service.searchContacts("nobody");

      expect(result).toHaveLength(0);
    });
  });

  describe("listContactGroups", () => {
    it("should list contact groups", async () => {
      mockContactGroupsList.mockResolvedValue({
        data: {
          contactGroups: [
            { resourceName: "contactGroups/friends", name: "Friends", memberCount: 10 },
            { resourceName: "contactGroups/family", name: "Family", memberCount: 5 },
          ],
        },
      });

      const result = await service.listContactGroups();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("Friends");
    });
  });

  describe("getContactGroup", () => {
    it("should get contact group", async () => {
      mockContactGroupsGet.mockResolvedValue({
        data: {
          resourceName: "contactGroups/friends",
          name: "Friends",
          memberCount: 10,
        },
      });

      const result = await service.getContactGroup("contactGroups/friends");

      expect(result.name).toBe("Friends");
      expect(result.memberCount).toBe(10);
    });
  });

  describe("getContactGroup with members", () => {
    it("should get contact group with members", async () => {
      mockContactGroupsGet.mockResolvedValue({
        data: {
          resourceName: "contactGroups/friends",
          name: "Friends",
          memberCount: 1,
          memberResourceNames: ["people/c123"],
        },
      });
      mockPeopleGet.mockResolvedValue({
        data: {
          resourceName: "people/c123",
          names: [{ displayName: "John Doe" }],
        },
      });

      const result = await service.getContactGroup("contactGroups/friends");

      expect(result.name).toBe("Friends");
      expect(result.members).toHaveLength(1);
    });

    it("should handle empty members", async () => {
      mockContactGroupsGet.mockResolvedValue({
        data: {
          resourceName: "contactGroups/empty",
          name: "Empty",
          memberCount: 0,
        },
      });

      const result = await service.getContactGroup("contactGroups/empty");

      expect(result.name).toBe("Empty");
      expect(result.members).toBeUndefined();
    });

    it("should handle member retrieval errors", async () => {
      mockContactGroupsGet.mockResolvedValue({
        data: {
          resourceName: "contactGroups/friends",
          name: "Friends",
          memberResourceNames: ["people/c123"],
        },
      });
      mockPeopleGet.mockRejectedValue(new Error("Not found"));

      const result = await service.getContactGroup("contactGroups/friends");

      expect(result.members).toBeUndefined();
    });
  });

  describe("createContactGroup", () => {
    it("should create contact group", async () => {
      mockContactGroupsCreate.mockResolvedValue({
        data: {
          resourceName: "contactGroups/newgroup",
          name: "New Group",
        },
      });

      const result = await service.createContactGroup("New Group");

      expect(mockContactGroupsCreate).toHaveBeenCalledWith({
        requestBody: { contactGroup: { name: "New Group" } },
      });
      expect(result.name).toBe("New Group");
    });
  });

  describe("deleteContactGroup", () => {
    it("should delete contact group", async () => {
      mockContactGroupsDelete.mockResolvedValue({});

      await service.deleteContactGroup("contactGroups/mygroup");

      expect(mockContactGroupsDelete).toHaveBeenCalledWith({
        resourceName: "contactGroups/mygroup",
        deleteContacts: false,
      });
    });
  });

  describe("searchDirectory", () => {
    it("should search directory", async () => {
      mockPeopleSearchDirectoryPeople.mockResolvedValue({
        data: {
          people: [
            { resourceName: "people/d123", names: [{ displayName: "Directory User" }] },
          ],
        },
      });

      const result = await service.searchDirectory("test");

      expect(result).toHaveLength(1);
      expect(result[0].displayName).toBe("Directory User");
    });

    it("should return empty array on error", async () => {
      mockPeopleSearchDirectoryPeople.mockRejectedValue(new Error("Not available"));

      const result = await service.searchDirectory("test");

      expect(result).toHaveLength(0);
    });
  });

  describe("addContactsToGroup", () => {
    it("calls members.modify with correct group and contact resource names", async () => {
      mockContactGroupsMembersModify.mockResolvedValue({ data: {} });

      await service.addContactsToGroup("contactGroups/abc123", ["people/c1", "people/c2"]);

      expect(mockContactGroupsMembersModify).toHaveBeenCalledWith({
        resourceName: "contactGroups/abc123",
        requestBody: { resourceNamesToAdd: ["people/c1", "people/c2"] },
      });
    });

    it("handles an empty contact list", async () => {
      mockContactGroupsMembersModify.mockResolvedValue({ data: {} });

      await service.addContactsToGroup("contactGroups/abc123", []);

      expect(mockContactGroupsMembersModify).toHaveBeenCalledWith({
        resourceName: "contactGroups/abc123",
        requestBody: { resourceNamesToAdd: [] },
      });
    });
  });

  describe("listOtherContacts", () => {
    it("should list other contacts", async () => {
      mockOtherContactsList.mockResolvedValue({
        data: {
          otherContacts: [
            { resourceName: "otherContacts/c123", names: [{ displayName: "Other Person" }] },
          ],
          nextPageToken: "token",
        },
      });

      const result = await service.listOtherContacts();

      expect(result.contacts).toHaveLength(1);
      expect(result.contacts[0].displayName).toBe("Other Person");
      expect(result.nextPageToken).toBe("token");
    });

    it("should handle empty other contacts", async () => {
      mockOtherContactsList.mockResolvedValue({ data: {} });

      const result = await service.listOtherContacts();

      expect(result.contacts).toHaveLength(0);
    });
  });
});
