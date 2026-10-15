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
    };
    Views: Record<never, never>;
    Functions: {
      auth_company_id: { Args: Record<PropertyKey, never>; Returns: string };
      auth_role: {
        Args: Record<PropertyKey, never>;
        Returns: Database['public']['Enums']['user_role'];
      };
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
      document_owner_company_id: {
        Args: {
          p_owner_id: string;
          p_owner_type: Database['public']['Enums']['document_owner_type'];
        };
        Returns: string;
      };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_company_approved: { Args: Record<PropertyKey, never>; Returns: boolean };
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
      company_type: 'shipper' | 'carrier';
      document_owner_type: 'company' | 'vehicle' | 'operator';
      taxpayer_type: 'moral' | 'fisica';
      user_role: 'shipper' | 'carrier' | 'operator' | 'admin';
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
      company_type: ['shipper', 'carrier'],
      document_owner_type: ['company', 'vehicle', 'operator'],
      taxpayer_type: ['moral', 'fisica'],
      user_role: ['shipper', 'carrier', 'operator', 'admin'],
      verification_status: ['pending_review', 'approved', 'rejected', 'expired', 'suspended'],
    },
  },
} as const;
