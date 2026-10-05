// Generado desde el esquema de Supabase (proyecto coufusmhvjgskxcbjhya). No editar a mano.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      admin_users: {
        Row: {
          active: boolean
          created_at: string
          email: string
          full_name: string | null
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email: string
          full_name?: string | null
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string
          full_name?: string | null
          user_id?: string
        }
        Relationships: []
      }
      alerts: {
        Row: {
          branch_id: string | null
          channels: string[]
          created_at: string
          dedupe_key: string
          employee_id: string | null
          error: string | null
          id: string
          message: string
          payload: Json
          sent_at: string | null
          status: Database["public"]["Enums"]["alert_status"]
          type: Database["public"]["Enums"]["alert_type"]
          work_date: string | null
        }
        Insert: {
          branch_id?: string | null
          channels?: string[]
          created_at?: string
          dedupe_key: string
          employee_id?: string | null
          error?: string | null
          id?: string
          message: string
          payload?: Json
          sent_at?: string | null
          status?: Database["public"]["Enums"]["alert_status"]
          type: Database["public"]["Enums"]["alert_type"]
          work_date?: string | null
        }
        Update: {
          branch_id?: string | null
          channels?: string[]
          created_at?: string
          dedupe_key?: string
          employee_id?: string | null
          error?: string | null
          id?: string
          message?: string
          payload?: Json
          sent_at?: string | null
          status?: Database["public"]["Enums"]["alert_status"]
          type?: Database["public"]["Enums"]["alert_type"]
          work_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alerts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_events: {
        Row: {
          branch_id: string | null
          challenge_id: string | null
          created_at: string
          employee_id: string
          event_type: Database["public"]["Enums"]["attendance_event_type"]
          evidence_path: string | null
          id: string
          ip: unknown
          match_distance: number | null
          occurred_at: string
          scene_path: string | null
          user_agent: string | null
          work_date: string
        }
        Insert: {
          branch_id?: string | null
          challenge_id?: string | null
          created_at?: string
          employee_id: string
          event_type: Database["public"]["Enums"]["attendance_event_type"]
          evidence_path?: string | null
          id?: string
          ip?: unknown
          match_distance?: number | null
          occurred_at?: string
          scene_path?: string | null
          user_agent?: string | null
          work_date: string
        }
        Update: {
          branch_id?: string | null
          challenge_id?: string | null
          created_at?: string
          employee_id?: string
          event_type?: Database["public"]["Enums"]["attendance_event_type"]
          evidence_path?: string | null
          id?: string
          ip?: unknown
          match_distance?: number | null
          occurred_at?: string
          scene_path?: string | null
          user_agent?: string | null
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_events_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_events_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          details: Json
          entity: string
          entity_id: string | null
          id: number
          occurred_at: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          details?: Json
          entity: string
          entity_id?: string | null
          id?: never
          occurred_at?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          details?: Json
          entity?: string
          entity_id?: string | null
          id?: never
          occurred_at?: string
        }
        Relationships: []
      }
      branch_ips: {
        Row: {
          branch_id: string
          created_at: string
          created_by: string | null
          id: string
          ip_range: unknown
          label: string | null
        }
        Insert: {
          branch_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          ip_range: unknown
          label?: string | null
        }
        Update: {
          branch_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          ip_range?: unknown
          label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branch_ips_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          active: boolean
          address: string | null
          code: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          code: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          code?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      employees: {
        Row: {
          active: boolean
          biometric_deleted_at: string | null
          branch_id: string
          cedula: string
          consent_at: string | null
          consent_by: string | null
          consent_revoked_at: string | null
          consent_version: string | null
          created_at: string
          entry_time: string
          entry_times: Json
          full_name: string
          id: string
          position: string
          updated_at: string
          work_days: number[]
        }
        Insert: {
          active?: boolean
          biometric_deleted_at?: string | null
          branch_id: string
          cedula: string
          consent_at?: string | null
          consent_by?: string | null
          consent_revoked_at?: string | null
          consent_version?: string | null
          created_at?: string
          entry_time: string
          entry_times?: Json
          full_name: string
          id?: string
          position: string
          updated_at?: string
          work_days?: number[]
        }
        Update: {
          active?: boolean
          biometric_deleted_at?: string | null
          branch_id?: string
          cedula?: string
          consent_at?: string | null
          consent_by?: string | null
          consent_revoked_at?: string | null
          consent_version?: string | null
          created_at?: string
          entry_time?: string
          entry_times?: Json
          full_name?: string
          id?: string
          position?: string
          updated_at?: string
          work_days?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "employees_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      face_templates: {
        Row: {
          created_at: string
          created_by: string | null
          descriptor: string
          detection_score: number | null
          employee_id: string
          id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          descriptor: string
          detection_score?: number | null
          employee_id: string
          id?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          descriptor?: string
          detection_score?: number | null
          employee_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "face_templates_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      failed_attempts: {
        Row: {
          branch_id: string | null
          details: Json
          employee_id: string | null
          evidence_path: string | null
          id: string
          ip: unknown
          match_distance: number | null
          occurred_at: string
          reason: Database["public"]["Enums"]["failed_attempt_reason"]
          user_agent: string | null
        }
        Insert: {
          branch_id?: string | null
          details?: Json
          employee_id?: string | null
          evidence_path?: string | null
          id?: string
          ip?: unknown
          match_distance?: number | null
          occurred_at?: string
          reason: Database["public"]["Enums"]["failed_attempt_reason"]
          user_agent?: string | null
        }
        Update: {
          branch_id?: string | null
          details?: Json
          employee_id?: string | null
          evidence_path?: string | null
          id?: string
          ip?: unknown
          match_distance?: number | null
          occurred_at?: string
          reason?: Database["public"]["Enums"]["failed_attempt_reason"]
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "failed_attempts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "failed_attempts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      kiosk_challenges: {
        Row: {
          branch_id: string | null
          consumed_at: string | null
          created_at: string
          employee_id: string | null
          evidence_path: string | null
          expires_at: string
          id: string
          identified_at: string | null
          ip: unknown
          marked_at: string | null
          match_distance: number | null
          scene_path: string | null
          steps: string[]
          user_agent: string | null
        }
        Insert: {
          branch_id?: string | null
          consumed_at?: string | null
          created_at?: string
          employee_id?: string | null
          evidence_path?: string | null
          expires_at: string
          id?: string
          identified_at?: string | null
          ip: unknown
          marked_at?: string | null
          match_distance?: number | null
          scene_path?: string | null
          steps: string[]
          user_agent?: string | null
        }
        Update: {
          branch_id?: string | null
          consumed_at?: string | null
          created_at?: string
          employee_id?: string | null
          evidence_path?: string | null
          expires_at?: string
          id?: string
          identified_at?: string | null
          ip?: unknown
          marked_at?: string | null
          match_distance?: number | null
          scene_path?: string | null
          steps?: string[]
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kiosk_challenges_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kiosk_challenges_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          branch_id: string | null
          challenge_id: string | null
          created_at: string
          employee_id: string
          evidence_path: string | null
          hours: number | null
          id: string
          ip: unknown
          kind: Database["public"]["Enums"]["permission_kind"]
          scene_path: string | null
          start_time: string | null
          work_date: string
        }
        Insert: {
          branch_id?: string | null
          challenge_id?: string | null
          created_at?: string
          employee_id: string
          evidence_path?: string | null
          hours?: number | null
          id?: string
          ip?: unknown
          kind: Database["public"]["Enums"]["permission_kind"]
          scene_path?: string | null
          start_time?: string | null
          work_date: string
        }
        Update: {
          branch_id?: string | null
          challenge_id?: string | null
          created_at?: string
          employee_id?: string
          evidence_path?: string | null
          hours?: number | null
          id?: string
          ip?: unknown
          kind?: Database["public"]["Enums"]["permission_kind"]
          scene_path?: string | null
          start_time?: string | null
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "permissions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permissions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          hits: number
          key: string
          window_start: string
        }
        Insert: {
          hits?: number
          key: string
          window_start: string
        }
        Update: {
          hits?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          alert_lunch_excess: boolean
          alert_lunch_overdue: boolean
          alert_suspicious: boolean
          cooldown_seconds: number
          entry_tolerance_minutes: number
          evidence_enabled: boolean
          evidence_retention_days: number
          face_match_threshold: number
          id: number
          liveness_steps: number
          lunch_alert_grace_minutes: number
          lunch_allowed_minutes: number
          suspicious_attempts_threshold: number
          suspicious_window_minutes: number
          updated_at: string
          updated_by: string | null
          work_days: number[]
        }
        Insert: {
          alert_lunch_excess?: boolean
          alert_lunch_overdue?: boolean
          alert_suspicious?: boolean
          cooldown_seconds?: number
          entry_tolerance_minutes?: number
          evidence_enabled?: boolean
          evidence_retention_days?: number
          face_match_threshold?: number
          id?: number
          liveness_steps?: number
          lunch_alert_grace_minutes?: number
          lunch_allowed_minutes?: number
          suspicious_attempts_threshold?: number
          suspicious_window_minutes?: number
          updated_at?: string
          updated_by?: string | null
          work_days?: number[]
        }
        Update: {
          alert_lunch_excess?: boolean
          alert_lunch_overdue?: boolean
          alert_suspicious?: boolean
          cooldown_seconds?: number
          entry_tolerance_minutes?: number
          evidence_enabled?: boolean
          evidence_retention_days?: number
          face_match_threshold?: number
          id?: number
          liveness_steps?: number
          lunch_alert_grace_minutes?: number
          lunch_allowed_minutes?: number
          suspicious_attempts_threshold?: number
          suspicious_window_minutes?: number
          updated_at?: string
          updated_by?: string | null
          work_days?: number[]
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_delete_biometrics: {
        Args: { p_employee_id: string }
        Returns: number
      }
      admin_delete_employee: {
        Args: { p_actor_id: string; p_employee_id: string }
        Returns: Json
      }
      admin_enroll_face: {
        Args: {
          p_descriptors: Json
          p_employee_id: string
          p_scores?: number[]
        }
        Returns: number
      }
      admin_record_consent: {
        Args: { p_employee_id: string; p_version: string }
        Returns: string
      }
      cleanup_kiosk_data: {
        Args: { p_evidence_before?: string }
        Returns: Json
      }
      detect_lunch_overdue: {
        Args: never
        Returns: {
          branch_id: string | null
          channels: string[]
          created_at: string
          dedupe_key: string
          employee_id: string | null
          error: string | null
          id: string
          message: string
          payload: Json
          sent_at: string | null
          status: Database["public"]["Enums"]["alert_status"]
          type: Database["public"]["Enums"]["alert_type"]
          work_date: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "alerts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      detect_suspicious_attempts: {
        Args: never
        Returns: {
          branch_id: string | null
          channels: string[]
          created_at: string
          dedupe_key: string
          employee_id: string | null
          error: string | null
          id: string
          message: string
          payload: Json
          sent_at: string | null
          status: Database["public"]["Enums"]["alert_status"]
          type: Database["public"]["Enums"]["alert_type"]
          work_date: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "alerts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      is_admin: { Args: never; Returns: boolean }
      kiosk_employee_status: {
        Args: { p_employee_id: string }
        Returns: {
          day_complete: boolean
          next_event: Database["public"]["Enums"]["attendance_event_type"]
          seconds_since_last: number
        }[]
      }
      kiosk_match_face: {
        Args: { p_descriptor: string; p_limit?: number }
        Returns: {
          branch_id: string
          distance: number
          employee_id: string
          full_name: string
        }[]
      }
      kiosk_register_attendance: {
        Args: {
          p_challenge_id: string
          p_event_type: Database["public"]["Enums"]["attendance_event_type"]
          p_ip: unknown
          p_ticket_ttl_seconds?: number
        }
        Returns: {
          branch_id: string
          employee_id: string
          event_id: string
          event_type: Database["public"]["Enums"]["attendance_event_type"]
          occurred_at: string
          work_date: string
        }[]
      }
      kiosk_register_permission: {
        Args: {
          p_challenge_id: string
          p_hours: number
          p_ip: unknown
          p_kind: Database["public"]["Enums"]["permission_kind"]
          p_start: string
          p_ticket_ttl_seconds?: number
        }
        Returns: {
          created_at: string
          employee_id: string
          hours: number
          kind: Database["public"]["Enums"]["permission_kind"]
          permission_id: string
          start_time: string
          work_date: string
        }[]
      }
      kiosk_resolve_branch: { Args: { p_ip: unknown }; Returns: string }
      next_attendance_event: {
        Args: { p_last: Database["public"]["Enums"]["attendance_event_type"] }
        Returns: Database["public"]["Enums"]["attendance_event_type"]
      }
      rate_limit_hit: {
        Args: { p_key: string; p_max: number; p_window_seconds: number }
        Returns: {
          allowed: boolean
          hits: number
        }[]
      }
    }
    Enums: {
      alert_status: "pendiente_envio" | "enviada" | "error"
      alert_type:
        | "exceso_almuerzo"
        | "almuerzo_sin_regreso"
        | "intentos_sospechosos"
      attendance_event_type:
        | "ENTRADA"
        | "SALIDA_ALMUERZO"
        | "REGRESO_ALMUERZO"
        | "SALIDA_FINAL"
      failed_attempt_reason:
        | "ip_no_permitida"
        | "movil_detectado"
        | "liveness_fallido"
        | "cara_desconocida"
        | "ambiguedad"
        | "reto_invalido"
        | "fuera_de_orden"
        | "cooldown"
        | "jornada_completa"
        | "empleado_inactivo"
        | "rate_limit"
        | "datos_invalidos"
      permission_kind: "dia_completo" | "horas"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      alert_status: ["pendiente_envio", "enviada", "error"],
      alert_type: [
        "exceso_almuerzo",
        "almuerzo_sin_regreso",
        "intentos_sospechosos",
      ],
      attendance_event_type: [
        "ENTRADA",
        "SALIDA_ALMUERZO",
        "REGRESO_ALMUERZO",
        "SALIDA_FINAL",
      ],
      failed_attempt_reason: [
        "ip_no_permitida",
        "movil_detectado",
        "liveness_fallido",
        "cara_desconocida",
        "ambiguedad",
        "reto_invalido",
        "fuera_de_orden",
        "cooldown",
        "jornada_completa",
        "empleado_inactivo",
        "rate_limit",
        "datos_invalidos",
      ],
      permission_kind: ["dia_completo", "horas"],
    },
  },
} as const
