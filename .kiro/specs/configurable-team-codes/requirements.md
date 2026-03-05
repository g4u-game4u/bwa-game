# Requirements Document

## Introduction

This feature makes the team codes for Supervisor, Gestor, and Diretor roles configurable via environment variables instead of being hardcoded. This allows different deployments to use different team codes without code changes, following the same pattern established for the `LOGO_URL` configuration.

## Glossary

- **Environment_Configuration**: The Angular environment files that provide configuration values for different deployment targets (development, staging, production)
- **Team_Code**: A unique identifier string (e.g., 'FkmdnFU') that identifies a management team in the Funifier system
- **User_Profile_Utility**: The utility module (`user-profile.ts`) that determines user roles based on team membership
- **MANAGEMENT_TEAM_IDS**: The constant object containing team codes for Gestão, Supervisão, and Direção roles

## Requirements

### Requirement 1: Environment Variable Configuration for Team Codes

**User Story:** As a system administrator, I want to configure team codes via environment variables, so that I can deploy the application to different environments with different team configurations without modifying the source code.

#### Acceptance Criteria

1. THE Environment_Configuration SHALL expose `supervisorTeamCode` property for the Supervisão team code
2. THE Environment_Configuration SHALL expose `gestorTeamCode` property for the Gestão team code
3. THE Environment_Configuration SHALL expose `diretorTeamCode` property for the Direção/Admin team code
4. WHEN the `SUPERVISOR_TEAM_CODE` or `supervisor_team_code` environment variable is set, THE Environment_Configuration SHALL use that value for `supervisorTeamCode`
5. WHEN the `GESTOR_TEAM_CODE` or `gestor_team_code` environment variable is set, THE Environment_Configuration SHALL use that value for `gestorTeamCode`
6. WHEN the `DIRETOR_TEAM_CODE` or `diretor_team_code` environment variable is set, THE Environment_Configuration SHALL use that value for `diretorTeamCode`

### Requirement 2: Backward Compatibility with Default Values

**User Story:** As a developer, I want the system to use default team codes when environment variables are not set, so that existing deployments continue to work without configuration changes.

#### Acceptance Criteria

1. WHEN the `SUPERVISOR_TEAM_CODE` environment variable is not set, THE Environment_Configuration SHALL default to 'Fkmdmko'
2. WHEN the `GESTOR_TEAM_CODE` environment variable is not set, THE Environment_Configuration SHALL default to 'FkmdnFU'
3. WHEN the `DIRETOR_TEAM_CODE` environment variable is not set, THE Environment_Configuration SHALL default to 'FkmdhZ9'
4. THE User_Profile_Utility SHALL read team codes from the Environment_Configuration instead of hardcoded values

### Requirement 3: User Profile Determination Using Configured Team Codes

**User Story:** As a user, I want my role to be correctly determined based on the configured team codes, so that I have appropriate access to dashboards and features.

#### Acceptance Criteria

1. WHEN determining user profile, THE User_Profile_Utility SHALL use the configured `diretorTeamCode` to identify Diretor users
2. WHEN determining user profile, THE User_Profile_Utility SHALL use the configured `gestorTeamCode` to identify Gestor users
3. WHEN determining user profile, THE User_Profile_Utility SHALL use the configured `supervisorTeamCode` to identify Supervisor users
4. WHEN a user has no configured management team codes, THE User_Profile_Utility SHALL assign the JOGADOR profile

### Requirement 4: Team Access Functions Using Configured Team Codes

**User Story:** As a manager, I want my accessible teams to be correctly calculated based on the configured team codes, so that I can view the appropriate team dashboards.

#### Acceptance Criteria

1. WHEN getting user's own team ID, THE User_Profile_Utility SHALL use the configured team codes to identify management teams
2. WHEN calculating accessible team IDs for a Supervisor, THE User_Profile_Utility SHALL filter out the configured `supervisorTeamCode`
3. WHEN calculating accessible team IDs for a Gestor, THE User_Profile_Utility SHALL filter out the configured `gestorTeamCode`

### Requirement 5: Environment File Consistency

**User Story:** As a DevOps engineer, I want all environment files to follow the same pattern for team code configuration, so that the configuration is consistent across all deployment targets.

#### Acceptance Criteria

1. THE development environment file SHALL include team code properties with hardcoded default values
2. THE production environment file SHALL read team codes from `process.env` with fallback to default values
3. THE homologation environment file SHALL read team codes from `process.env` with fallback to default values
4. THE Environment_Configuration SHALL support both uppercase (`SUPERVISOR_TEAM_CODE`) and lowercase (`supervisor_team_code`) environment variable names
