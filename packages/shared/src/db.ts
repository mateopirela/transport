export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          company_id: string | null;
          id: string;
          new_data: Json | null;
          occurred_at: string;
          old_data: Json | null;
          record_id: string | null;
          table_name: string;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_id?: string | null;
          company_id?: string | null;
          id?: string;
          new_data?: Json | null;
          occurred_at?: string;
          old_data?: Json | null;
          record_id?: string | null;
          table_name: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          company_id?: string | null;
          id?: string;
          new_data?: Json | null;
          occurred_at?: string;
          old_data?: Json | null;
          record_id?: string | null;
          table_name?: string;
        };
        Relationships: [];
      };
      carrier_routes: {
        Row: {
          archived_at: string | null;
          company_id: string;
          created_at: string;
          destination_city: string;
          destination_location: unknown;
          destination_state: string;
          id: string;
          notes: string | null;
          origin_city: string;
          origin_location: unknown;
          origin_state: string;
          unit_types: Database['public']['Enums']['unit_type'][];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
          company_id: string;
          created_at?: string;
          destination_city: string;
          destination_location?: unknown;
          destination_state: string;
          id?: string;
          notes?: string | null;
          origin_city: string;
          origin_location?: unknown;
          origin_state: string;
          unit_types?: Database['public']['Enums']['unit_type'][];
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          company_id?: string;
          created_at?: string;
          destination_city?: string;
          destination_location?: unknown;
          destination_state?: string;
          id?: string;
          notes?: string | null;
          origin_city?: string;
          origin_location?: unknown;
          origin_state?: string;
          unit_types?: Database['public']['Enums']['unit_type'][];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'carrier_routes_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
        ];
      };
      companies: {
        Row: {
          archived_at: string | null;
          contact_email: string | null;
          contact_name: string | null;
          contact_phone: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          legal_name: string;
          rfc: string;
          status: Database['public']['Enums']['verification_status'];
          status_reason: string | null;
          type: Database['public']['Enums']['company_type'];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
          contact_email?: string | null;
          contact_name?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          legal_name: string;
          rfc: string;
          status?: Database['public']['Enums']['verification_status'];
          status_reason?: string | null;
          type: Database['public']['Enums']['company_type'];
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          contact_email?: string | null;
          contact_name?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          legal_name?: string;
          rfc?: string;
          status?: Database['public']['Enums']['verification_status'];
          status_reason?: string | null;
          type?: Database['public']['Enums']['company_type'];
          updated_at?: string;
        };
        Relationships: [];
      };
      document_requirements: {
        Row: {
          archived_at: string | null;
          code: string;
          company_type: Database['public']['Enums']['company_type'] | null;
          created_at: string;
          description: string | null;
          id: string;
          is_required: boolean;
          name: string;
          owner_type: Database['public']['Enums']['document_owner_type'];
          requires_expiry: boolean;
          sort_order: number;
          taxpayer_type: Database['public']['Enums']['taxpayer_type'] | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
          code: string;
          company_type?: Database['public']['Enums']['company_type'] | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_required?: boolean;
          name: string;
          owner_type: Database['public']['Enums']['document_owner_type'];
          requires_expiry?: boolean;
          sort_order?: number;
          taxpayer_type?: Database['public']['Enums']['taxpayer_type'] | null;
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          code?: string;
          company_type?: Database['public']['Enums']['company_type'] | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_required?: boolean;
          name?: string;
          owner_type?: Database['public']['Enums']['document_owner_type'];
          requires_expiry?: boolean;
          sort_order?: number;
          taxpayer_type?: Database['public']['Enums']['taxpayer_type'] | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      documents: {
        Row: {
          archived_at: string | null;
          company_id: string;
          created_at: string;
          expires_at: string | null;
          file_name: string | null;
          id: string;
          mime_type: string | null;
          owner_id: string;
          owner_type: Database['public']['Enums']['document_owner_type'];
          requirement_id: string;
          review_notes: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          size_bytes: number | null;
          status: Database['public']['Enums']['verification_status'];
          storage_path: string;
          submitted_by: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
          company_id: string;
          created_at?: string;
          expires_at?: string | null;
          file_name?: string | null;
          id?: string;
          mime_type?: string | null;
          owner_id: string;
          owner_type: Database['public']['Enums']['document_owner_type'];
          requirement_id: string;
          review_notes?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          size_bytes?: number | null;
          status?: Database['public']['Enums']['verification_status'];
          storage_path: string;
          submitted_by?: string | null;
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          company_id?: string;
          created_at?: string;
          expires_at?: string | null;
          file_name?: string | null;
          id?: string;
          mime_type?: string | null;
          owner_id?: string;
          owner_type?: Database['public']['Enums']['document_owner_type'];
          requirement_id?: string;
          review_notes?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          size_bytes?: number | null;
          status?: Database['public']['Enums']['verification_status'];
          storage_path?: string;
          submitted_by?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'documents_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'documents_requirement_id_fkey';
            columns: ['requirement_id'];
            isOneToOne: false;
            referencedRelation: 'document_requirements';
            referencedColumns: ['id'];
          },
        ];
      };
      operator_invitations: {
        Row: {
          accepted_at: string | null;
          accepted_by: string | null;
          code_hash: string;
          company_id: string;
          created_at: string;
          created_by: string | null;
          email: string;
          expires_at: string;
          id: string;
          operator_id: string;
          revoked_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          code_hash: string;
          company_id: string;
          created_at?: string;
          created_by?: string | null;
          email: string;
          expires_at: string;
          id?: string;
          operator_id: string;
          revoked_at?: string | null;
        };
        Update: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          code_hash?: string;
          company_id?: string;
          created_at?: string;
          created_by?: string | null;
          email?: string;
          expires_at?: string;
          id?: string;
          operator_id?: string;
          revoked_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'operator_invitations_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'operator_invitations_operator_fkey';
            columns: ['company_id', 'operator_id'];
            isOneToOne: false;
            referencedRelation: 'operators';
            referencedColumns: ['company_id', 'id'];
          },
        ];
      };
      operators: {
        Row: {
          archived_at: string | null;
          company_id: string;
          created_at: string;
          email: string | null;
          full_name: string;
          id: string;
          license_expires_on: string | null;
          license_number: string | null;
          license_type: Database['public']['Enums']['license_type'] | null;
          phone: string | null;
          profile_id: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
          company_id: string;
          created_at?: string;
          email?: string | null;
          full_name: string;
          id?: string;
          license_expires_on?: string | null;
          license_number?: string | null;
          license_type?: Database['public']['Enums']['license_type'] | null;
          phone?: string | null;
          profile_id?: string | null;
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          company_id?: string;
          created_at?: string;
          email?: string | null;
          full_name?: string;
          id?: string;
          license_expires_on?: string | null;
          license_number?: string | null;
          license_type?: Database['public']['Enums']['license_type'] | null;
          phone?: string | null;
          profile_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'operators_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'operators_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          company_id: string | null;
          created_at: string;
          full_name: string | null;
          id: string;
          phone: string | null;
          role: Database['public']['Enums']['user_role'];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          company_id?: string | null;
          created_at?: string;
          full_name?: string | null;
          id: string;
          phone?: string | null;
          role: Database['public']['Enums']['user_role'];
          updated_at?: string;
        };
        Update: {
          company_id?: string | null;
          created_at?: string;
          full_name?: string | null;
          id?: string;
          phone?: string | null;
          role?: Database['public']['Enums']['user_role'];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'profiles_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
        ];
      };
      vehicle_availability: {
        Row: {
          archived_at: string | null;
          available_from: string;
          city: string;
          company_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          location: unknown;
          source: Database['public']['Enums']['availability_source'];
          state: string;
          vehicle_id: string;
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
          available_from: string;
          city: string;
          company_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          location: unknown;
          source?: Database['public']['Enums']['availability_source'];
          state: string;
          vehicle_id: string;
        };
        Update: {
          archived_at?: string | null;
          available_from?: string;
          city?: string;
          company_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          location?: unknown;
          source?: Database['public']['Enums']['availability_source'];
          state?: string;
          vehicle_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'vehicle_availability_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vehicle_availability_vehicle_fkey';
            columns: ['company_id', 'vehicle_id'];
            isOneToOne: false;
            referencedRelation: 'vehicles';
            referencedColumns: ['company_id', 'id'];
          },
        ];
      };
      vehicles: {
        Row: {
          archived_at: string | null;
          capacity_kg: number | null;
          capacity_m3: number | null;
          company_id: string;
          created_at: string;
          current_operator_id: string | null;
          features: Database['public']['Enums']['special_requirement'][];
          fleet_number: string | null;
          id: string;
          kind: Database['public']['Enums']['vehicle_kind'];
          model_year: number | null;
          plate: string;
          unit_type: Database['public']['Enums']['unit_type'] | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
          capacity_kg?: number | null;
          capacity_m3?: number | null;
          company_id: string;
          created_at?: string;
          current_operator_id?: string | null;
          features?: Database['public']['Enums']['special_requirement'][];
          fleet_number?: string | null;
          id?: string;
          kind: Database['public']['Enums']['vehicle_kind'];
          model_year?: number | null;
          plate: string;
          unit_type?: Database['public']['Enums']['unit_type'] | null;
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          capacity_kg?: number | null;
          capacity_m3?: number | null;
          company_id?: string;
          created_at?: string;
          current_operator_id?: string | null;
          features?: Database['public']['Enums']['special_requirement'][];
          fleet_number?: string | null;
          id?: string;
          kind?: Database['public']['Enums']['vehicle_kind'];
          model_year?: number | null;
          plate?: string;
          unit_type?: Database['public']['Enums']['unit_type'] | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'vehicles_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vehicles_current_operator_fkey';
            columns: ['company_id', 'current_operator_id'];
            isOneToOne: false;
            referencedRelation: 'operators';
            referencedColumns: ['company_id', 'id'];
          },
        ];
      };
    };
    Views: Record<never, never>;
    Functions: {
      accept_operator_invitation: { Args: { p_code: string }; Returns: string };
      admin_list_users: {
        Args: { p_limit?: number; p_offset?: number; p_search?: string };
        Returns: {
          company_id: string;
          company_legal_name: string;
          company_rfc: string;
          company_status: Database['public']['Enums']['verification_status'];
          company_type: Database['public']['Enums']['company_type'];
          created_at: string;
          email: string;
          full_name: string;
          id: string;
          last_sign_in_at: string;
          role: Database['public']['Enums']['user_role'];
          total_count: number;
        }[];
      };
      auth_company_id: { Args: Record<PropertyKey, never>; Returns: string };
      auth_fleet_company_id: { Args: Record<PropertyKey, never>; Returns: string };
      auth_operator_id: { Args: Record<PropertyKey, never>; Returns: string };
      auth_role: {
        Args: Record<PropertyKey, never>;
        Returns: Database['public']['Enums']['user_role'];
      };
      clear_vehicle_availability: { Args: { p_vehicle_id: string }; Returns: undefined };
      company_missing_requirements: {
        Args: { p_company_id: string };
        Returns: {
          archived_at: string | null;
          code: string;
          company_type: Database['public']['Enums']['company_type'] | null;
          created_at: string;
          description: string | null;
          id: string;
          is_required: boolean;
          name: string;
          owner_type: Database['public']['Enums']['document_owner_type'];
          requires_expiry: boolean;
          sort_order: number;
          taxpayer_type: Database['public']['Enums']['taxpayer_type'] | null;
          updated_at: string;
        }[];
        SetofOptions: {
          from: '*';
          to: 'document_requirements';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      create_company: {
        Args: {
          p_contact_email?: string;
          p_contact_name?: string;
          p_contact_phone?: string;
          p_legal_name: string;
          p_rfc: string;
        };
        Returns: string;
      };
      create_operator_invitation: {
        Args: { p_operator_id: string; p_valid_for_hours?: number };
        Returns: {
          code: string;
          expires_at: string;
          invitation_id: string;
        }[];
      };
      document_owner_company_id: {
        Args: {
          p_owner_id: string;
          p_owner_type: Database['public']['Enums']['document_owner_type'];
        };
        Returns: string;
      };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_company_approved: { Args: Record<PropertyKey, never>; Returns: boolean };
      request_company_review: {
        Args: Record<PropertyKey, never>;
        Returns: Database['public']['Enums']['verification_status'];
      };
      review_company: {
        Args: { p_company_id: string; p_decision: string; p_notes?: string };
        Returns: Database['public']['Enums']['verification_status'];
      };
      review_document: {
        Args: {
          p_decision: string;
          p_document_id: string;
          p_expires_at?: string;
          p_notes?: string;
        };
        Returns: Database['public']['Enums']['verification_status'];
      };
      revoke_operator_invitation: { Args: { p_invitation_id: string }; Returns: undefined };
      set_vehicle_availability: {
        Args: {
          p_available_from: string;
          p_city: string;
          p_latitude: number;
          p_longitude: number;
          p_state: string;
          p_vehicle_id: string;
        };
        Returns: string;
      };
      submit_document: {
        Args: {
          p_expires_at?: string;
          p_file_name?: string;
          p_owner_id: string;
          p_owner_type: Database['public']['Enums']['document_owner_type'];
          p_requirement_id: string;
          p_storage_path: string;
        };
        Returns: string;
      };
      taxpayer_type_for_rfc: {
        Args: { p_rfc: string };
        Returns: Database['public']['Enums']['taxpayer_type'];
      };
    };
    Enums: {
      availability_source: 'manual' | 'trip_estimate';
      company_type: 'shipper' | 'carrier';
      document_owner_type: 'company' | 'vehicle' | 'operator';
      license_type: 'B' | 'C' | 'E';
      special_requirement:
        | 'temperature_control'
        | 'hazmat_permit'
        | 'liftgate'
        | 'tarp'
        | 'cargo_securing'
        | 'security_escort'
        | 'team_drivers'
        | 'extended_cargo_insurance'
        | 'loading_crew';
      taxpayer_type: 'moral' | 'fisica';
      unit_type:
        | 'dry_van'
        | 'refrigerated'
        | 'flatbed'
        | 'lowboy'
        | 'hopper'
        | 'tanker'
        | 'container_chassis'
        | 'cage'
        | 'stake_bed'
        | 'torton'
        | 'rabon'
        | 'pickup_3_5t';
      user_role: 'shipper' | 'carrier' | 'operator' | 'admin';
      vehicle_kind: 'tractor' | 'rigid' | 'trailer';
      verification_status: 'pending_review' | 'approved' | 'rejected' | 'expired' | 'suspended';
    };
    CompositeTypes: Record<never, never>;
  };
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      availability_source: ['manual', 'trip_estimate'],
      company_type: ['shipper', 'carrier'],
      document_owner_type: ['company', 'vehicle', 'operator'],
      license_type: ['B', 'C', 'E'],
      special_requirement: [
        'temperature_control',
        'hazmat_permit',
        'liftgate',
        'tarp',
        'cargo_securing',
        'security_escort',
        'team_drivers',
        'extended_cargo_insurance',
        'loading_crew',
      ],
      taxpayer_type: ['moral', 'fisica'],
      unit_type: [
        'dry_van',
        'refrigerated',
        'flatbed',
        'lowboy',
        'hopper',
        'tanker',
        'container_chassis',
        'cage',
        'stake_bed',
        'torton',
        'rabon',
        'pickup_3_5t',
      ],
      user_role: ['shipper', 'carrier', 'operator', 'admin'],
      vehicle_kind: ['tractor', 'rigid', 'trailer'],
      verification_status: ['pending_review', 'approved', 'rejected', 'expired', 'suspended'],
    },
  },
} as const;
