CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`issuer` text,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `actuaciones` (
	`id` text PRIMARY KEY NOT NULL,
	`causa_id` text NOT NULL,
	`fecha` text NOT NULL,
	`tipo` text NOT NULL,
	`detalle` text NOT NULL,
	`detalle_hash` text NOT NULL,
	`origen` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`causa_id`) REFERENCES `causas`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_actuaciones_causa_fecha` ON `actuaciones` (`causa_id`,`fecha`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_actuaciones_dedup` ON `actuaciones` (`causa_id`,`fecha`,`tipo`,`detalle_hash`);--> statement-breakpoint
CREATE TABLE `archivos` (
	`id` text PRIMARY KEY NOT NULL,
	`causa_id` text NOT NULL,
	`nombre_original` text NOT NULL,
	`ruta_relativa` text NOT NULL,
	`mime` text NOT NULL,
	`tamano` integer NOT NULL,
	`subido_por` text NOT NULL,
	`indexado_rag` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`causa_id`) REFERENCES `causas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`subido_por`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_archivos_causa` ON `archivos` (`causa_id`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`entidad` text NOT NULL,
	`entidad_id` text NOT NULL,
	`accion` text NOT NULL,
	`diff_json` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_audit_entidad` ON `audit_log` (`entidad`,`entidad_id`);--> statement-breakpoint
CREATE INDEX `idx_audit_created` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `causas` (
	`id` text PRIMARY KEY NOT NULL,
	`numero_juicio` text NOT NULL,
	`cliente_id` text,
	`tipo_accion` text,
	`materia` text,
	`judicatura` text,
	`estado` text,
	`fecha_ingreso` text,
	`origen` text NOT NULL,
	`ultima_sincronizacion` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `causas_numero_juicio_unique` ON `causas` (`numero_juicio`);--> statement-breakpoint
CREATE INDEX `idx_causas_cliente` ON `causas` (`cliente_id`);--> statement-breakpoint
CREATE TABLE `clientes` (
	`id` text PRIMARY KEY NOT NULL,
	`nombre_completo` text NOT NULL,
	`cedula` text,
	`telefono` text,
	`email` text,
	`notas` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clientes_cedula_unique` ON `clientes` (`cedula`);--> statement-breakpoint
CREATE INDEX `idx_clientes_nombre` ON `clientes` (`nombre_completo`);--> statement-breakpoint
CREATE TABLE `conversaciones` (
	`id` text PRIMARY KEY NOT NULL,
	`titulo` text NOT NULL,
	`causa_id` text,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`causa_id`) REFERENCES `causas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `correos_resumen` (
	`id` text PRIMARY KEY NOT NULL,
	`fecha` text NOT NULL,
	`resumen_json` text NOT NULL,
	`generado_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `documento_yjs` (
	`documento_id` text PRIMARY KEY NOT NULL,
	`estado_binario` blob NOT NULL,
	`snapshot_json` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`documento_id`) REFERENCES `documentos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `documentos` (
	`id` text PRIMARY KEY NOT NULL,
	`titulo` text NOT NULL,
	`tarea_id` text,
	`causa_id` text,
	`estado` text DEFAULT 'borrador' NOT NULL,
	`creado_por` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`tarea_id`) REFERENCES `tareas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`causa_id`) REFERENCES `causas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`creado_por`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `eventos` (
	`id` text PRIMARY KEY NOT NULL,
	`tipo` text NOT NULL,
	`titulo` text NOT NULL,
	`descripcion` text,
	`fecha` text NOT NULL,
	`hora` text,
	`causa_id` text,
	`cliente_id` text,
	`origen` text NOT NULL,
	`regla_id` text,
	`correo_origen_id` text,
	`estado` text DEFAULT 'pendiente' NOT NULL,
	`creado_por` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`causa_id`) REFERENCES `causas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`regla_id`) REFERENCES `reglas_plazo`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`creado_por`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_eventos_fecha` ON `eventos` (`fecha`);--> statement-breakpoint
CREATE INDEX `idx_eventos_causa` ON `eventos` (`causa_id`);--> statement-breakpoint
CREATE INDEX `idx_eventos_regla_causa_fecha` ON `eventos` (`regla_id`,`causa_id`,`fecha`);--> statement-breakpoint
CREATE TABLE `feriados` (
	`fecha` text PRIMARY KEY NOT NULL,
	`nombre` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `graph_tokens` (
	`user_id` text PRIMARY KEY NOT NULL,
	`refresh_token_cifrado` text NOT NULL,
	`home_account_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `idempotency_keys` (
	`key` text PRIMARY KEY NOT NULL,
	`respuesta_json` text,
	`expira_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mensajes` (
	`id` text PRIMARY KEY NOT NULL,
	`conversacion_id` text NOT NULL,
	`role` text NOT NULL,
	`parts_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`conversacion_id`) REFERENCES `conversaciones`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_mensajes_conv` ON `mensajes` (`conversacion_id`);--> statement-breakpoint
CREATE TABLE `notificaciones` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`tipo` text NOT NULL,
	`mensaje` text NOT NULL,
	`link` text,
	`leida` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_notif_user_leida` ON `notificaciones` (`user_id`,`leida`);--> statement-breakpoint
CREATE INDEX `idx_notif_created` ON `notificaciones` (`created_at`);--> statement-breakpoint
CREATE TABLE `partes_procesales` (
	`id` text PRIMARY KEY NOT NULL,
	`causa_id` text NOT NULL,
	`tipo` text NOT NULL,
	`nombre` text NOT NULL,
	`representante` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`causa_id`) REFERENCES `causas`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_partes_causa` ON `partes_procesales` (`causa_id`);--> statement-breakpoint
CREATE TABLE `rag_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`fuente_tipo` text NOT NULL,
	`fuente_id` text NOT NULL,
	`causa_id` text,
	`titulo_fuente` text,
	`contenido` text NOT NULL,
	`embedding` blob,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_rag_chunks_fuente` ON `rag_chunks` (`fuente_tipo`,`fuente_id`);--> statement-breakpoint
CREATE INDEX `idx_rag_chunks_causa` ON `rag_chunks` (`causa_id`);--> statement-breakpoint
CREATE TABLE `reglas_plazo` (
	`id` text PRIMARY KEY NOT NULL,
	`nombre` text NOT NULL,
	`actuacion_trigger` text NOT NULL,
	`tipo_proceso` text NOT NULL,
	`dias` integer NOT NULL,
	`tipo_dias` text NOT NULL,
	`evento_tipo` text,
	`evento_titulo_template` text,
	`activo` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE TABLE `sadje_cache` (
	`clave` text PRIMARY KEY NOT NULL,
	`payload_json` text NOT NULL,
	`expira_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_id_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `tareas` (
	`id` text PRIMARY KEY NOT NULL,
	`titulo` text NOT NULL,
	`descripcion` text,
	`color` text DEFAULT 'blue' NOT NULL,
	`columna` text DEFAULT 'por_hacer' NOT NULL,
	`orden` real NOT NULL,
	`causa_id` text,
	`evento_id` text,
	`asignado_a` text,
	`creado_por` text NOT NULL,
	`documento_id` text,
	`fecha_limite` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`causa_id`) REFERENCES `causas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`evento_id`) REFERENCES `eventos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asignado_a`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`creado_por`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_tareas_columna_orden` ON `tareas` (`columna`,`orden`);--> statement-breakpoint
CREATE INDEX `idx_tareas_asignado` ON `tareas` (`asignado_a`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`role` text DEFAULT 'asistente' NOT NULL,
	`activo` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);