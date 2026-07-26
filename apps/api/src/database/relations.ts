import { relations } from "drizzle-orm";
import {
  accountTable,
  activityTable,
  apikeyTable,
  assetTable,
  columnTable,
  commentTable,
  externalLinkTable,
  githubIntegrationTable,
  integrationTable,
  invitationTable,
  labelTable,
  notificationTable,
  boardTable,
  sessionTable,
  taskRelationTable,
  taskReminderSentTable,
  taskTable,
  teamMemberTable,
  teamTable,
  timeEntryTable,
  userNotificationPreferenceTable,
  userNotificationOrgBoardTable,
  userNotificationOrgRuleTable,
  userTable,
  verificationTable,
  workflowRuleTable,
  organizationRoleTable,
  organizationTable,
  organizationMemberTable,
} from "./schema";

export const userTableRelations = relations(userTable, ({ many, one }) => ({
  sessions: many(sessionTable),
  accounts: many(accountTable),
  teamMembers: many(teamMemberTable),
  organizations: many(organizationTable),
  organizationMemberships: many(organizationMemberTable),
  assignedTasks: many(taskTable),
  timeEntries: many(timeEntryTable),
  activities: many(activityTable),
  comments: many(commentTable),
  assets: many(assetTable),
  notifications: many(notificationTable),
  notificationPreference: one(userNotificationPreferenceTable),
  notificationOrganizationRules: many(userNotificationOrgRuleTable),
  sentInvitations: many(invitationTable),
  apikeys: many(apikeyTable),
}));

export const sessionTableRelations = relations(sessionTable, ({ one }) => ({
  user: one(userTable, {
    fields: [sessionTable.userId],
    references: [userTable.id],
  }),
}));

export const accountTableRelations = relations(accountTable, ({ one }) => ({
  user: one(userTable, {
    fields: [accountTable.userId],
    references: [userTable.id],
  }),
}));

export const verificationTableRelations = relations(
  verificationTable,
  () => ({}),
);

export const organizationTableRelations = relations(
  organizationTable,
  ({ many }) => ({
    teams: many(teamTable),
    members: many(organizationMemberTable),
    boards: many(boardTable),
    assets: many(assetTable),
    invitations: many(invitationTable),
    notificationOrganizationRules: many(userNotificationOrgRuleTable),
  }),
);

export const organizationMemberTableRelations = relations(
  organizationMemberTable,
  ({ one }) => ({
    organization: one(organizationTable, {
      fields: [organizationMemberTable.organizationId],
      references: [organizationTable.id],
    }),
    user: one(userTable, {
      fields: [organizationMemberTable.userId],
      references: [userTable.id],
    }),
  }),
);

export const boardTableRelations = relations(
  boardTable,
  ({ one, many }) => ({
    organization: one(organizationTable, {
      fields: [boardTable.organizationId],
      references: [organizationTable.id],
    }),
    tasks: many(taskTable),
    assets: many(assetTable),
    columns: many(columnTable),
    workflowRules: many(workflowRuleTable),
    githubIntegration: many(githubIntegrationTable),
    integrations: many(integrationTable),
    notificationOrganizationBoards: many(userNotificationOrgBoardTable),
  }),
);

export const columnTableRelations = relations(columnTable, ({ one, many }) => ({
  board: one(boardTable, {
    fields: [columnTable.boardId],
    references: [boardTable.id],
  }),
  tasks: many(taskTable),
  workflowRules: many(workflowRuleTable),
}));

export const workflowRuleTableRelations = relations(
  workflowRuleTable,
  ({ one }) => ({
    board: one(boardTable, {
      fields: [workflowRuleTable.boardId],
      references: [boardTable.id],
    }),
    column: one(columnTable, {
      fields: [workflowRuleTable.columnId],
      references: [columnTable.id],
    }),
  }),
);

export const taskTableRelations = relations(taskTable, ({ one, many }) => ({
  board: one(boardTable, {
    fields: [taskTable.boardId],
    references: [boardTable.id],
  }),
  assignee: one(userTable, {
    fields: [taskTable.userId],
    references: [userTable.id],
  }),
  column: one(columnTable, {
    fields: [taskTable.columnId],
    references: [columnTable.id],
  }),
  timeEntries: many(timeEntryTable),
  activities: many(activityTable),
  comments: many(commentTable),
  assets: many(assetTable),
  labels: many(labelTable),
  externalLinks: many(externalLinkTable),
  sourceRelations: many(taskRelationTable, { relationName: "sourceTask" }),
  targetRelations: many(taskRelationTable, { relationName: "targetTask" }),
  remindersSent: many(taskReminderSentTable),
}));

export const timeEntryTableRelations = relations(timeEntryTable, ({ one }) => ({
  task: one(taskTable, {
    fields: [timeEntryTable.taskId],
    references: [taskTable.id],
  }),
  user: one(userTable, {
    fields: [timeEntryTable.userId],
    references: [userTable.id],
  }),
}));

export const activityTableRelations = relations(activityTable, ({ one }) => ({
  task: one(taskTable, {
    fields: [activityTable.taskId],
    references: [taskTable.id],
  }),
  user: one(userTable, {
    fields: [activityTable.userId],
    references: [userTable.id],
  }),
}));

export const assetTableRelations = relations(assetTable, ({ one }) => ({
  organization: one(organizationTable, {
    fields: [assetTable.organizationId],
    references: [organizationTable.id],
  }),
  board: one(boardTable, {
    fields: [assetTable.boardId],
    references: [boardTable.id],
  }),
  task: one(taskTable, {
    fields: [assetTable.taskId],
    references: [taskTable.id],
  }),
  activity: one(activityTable, {
    fields: [assetTable.activityId],
    references: [activityTable.id],
  }),
  creator: one(userTable, {
    fields: [assetTable.createdBy],
    references: [userTable.id],
  }),
}));

export const labelTableRelations = relations(labelTable, ({ one }) => ({
  task: one(taskTable, {
    fields: [labelTable.taskId],
    references: [taskTable.id],
  }),
}));

export const notificationTableRelations = relations(
  notificationTable,
  ({ one }) => ({
    user: one(userTable, {
      fields: [notificationTable.userId],
      references: [userTable.id],
    }),
  }),
);

export const userNotificationPreferenceTableRelations = relations(
  userNotificationPreferenceTable,
  ({ one }) => ({
    user: one(userTable, {
      fields: [userNotificationPreferenceTable.userId],
      references: [userTable.id],
    }),
  }),
);

export const userNotificationOrgRuleTableRelations = relations(
  userNotificationOrgRuleTable,
  ({ one, many }) => ({
    user: one(userTable, {
      fields: [userNotificationOrgRuleTable.userId],
      references: [userTable.id],
    }),
    organization: one(organizationTable, {
      fields: [userNotificationOrgRuleTable.organizationId],
      references: [organizationTable.id],
    }),
    selectedBoards: many(userNotificationOrgBoardTable),
  }),
);

export const userNotificationOrgBoardTableRelations = relations(
  userNotificationOrgBoardTable,
  ({ one }) => ({
    organizationRule: one(userNotificationOrgRuleTable, {
      fields: [
        userNotificationOrgBoardTable.organizationId,
        userNotificationOrgBoardTable.orgRuleId,
      ],
      references: [
        userNotificationOrgRuleTable.organizationId,
        userNotificationOrgRuleTable.id,
      ],
    }),
    board: one(boardTable, {
      fields: [
        userNotificationOrgBoardTable.organizationId,
        userNotificationOrgBoardTable.boardId,
      ],
      references: [boardTable.organizationId, boardTable.id],
    }),
  }),
);

export const githubIntegrationTableRelations = relations(
  githubIntegrationTable,
  ({ one }) => ({
    board: one(boardTable, {
      fields: [githubIntegrationTable.boardId],
      references: [boardTable.id],
    }),
  }),
);

export const teamTableRelations = relations(teamTable, ({ one, many }) => ({
  organization: one(organizationTable, {
    fields: [teamTable.organizationId],
    references: [organizationTable.id],
  }),
  teamMembers: many(teamMemberTable),
}));

export const teamMemberTableRelations = relations(
  teamMemberTable,
  ({ one }) => ({
    team: one(teamTable, {
      fields: [teamMemberTable.teamId],
      references: [teamTable.id],
    }),
    user: one(userTable, {
      fields: [teamMemberTable.userId],
      references: [userTable.id],
    }),
  }),
);

export const invitationTableRelations = relations(
  invitationTable,
  ({ one }) => ({
    organization: one(organizationTable, {
      fields: [invitationTable.organizationId],
      references: [organizationTable.id],
    }),
    inviter: one(userTable, {
      fields: [invitationTable.inviterId],
      references: [userTable.id],
    }),
  }),
);

export const organizationRoleTableRelations = relations(
  organizationRoleTable,
  ({ one }) => ({
    organization: one(organizationTable, {
      fields: [organizationRoleTable.organizationId],
      references: [organizationTable.id],
    }),
  }),
);

export const apikeyTableRelations = relations(apikeyTable, ({ one }) => ({
  user: one(userTable, {
    fields: [apikeyTable.referenceId],
    references: [userTable.id],
  }),
}));

export const integrationTableRelations = relations(
  integrationTable,
  ({ one, many }) => ({
    board: one(boardTable, {
      fields: [integrationTable.boardId],
      references: [boardTable.id],
    }),
    externalLinks: many(externalLinkTable),
  }),
);

export const taskRelationTableRelations = relations(
  taskRelationTable,
  ({ one }) => ({
    sourceTask: one(taskTable, {
      fields: [taskRelationTable.sourceTaskId],
      references: [taskTable.id],
      relationName: "sourceTask",
    }),
    targetTask: one(taskTable, {
      fields: [taskRelationTable.targetTaskId],
      references: [taskTable.id],
      relationName: "targetTask",
    }),
  }),
);

export const externalLinkTableRelations = relations(
  externalLinkTable,
  ({ one }) => ({
    task: one(taskTable, {
      fields: [externalLinkTable.taskId],
      references: [taskTable.id],
    }),
    integration: one(integrationTable, {
      fields: [externalLinkTable.integrationId],
      references: [integrationTable.id],
    }),
  }),
);

export const taskReminderSentTableRelations = relations(
  taskReminderSentTable,
  ({ one }) => ({
    task: one(taskTable, {
      fields: [taskReminderSentTable.taskId],
      references: [taskTable.id],
    }),
  }),
);

export const commentTableRelations = relations(commentTable, ({ one }) => ({
  task: one(taskTable, {
    fields: [commentTable.taskId],
    references: [taskTable.id],
  }),
  user: one(userTable, {
    fields: [commentTable.userId],
    references: [userTable.id],
  }),
}));
