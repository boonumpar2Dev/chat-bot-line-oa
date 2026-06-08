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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_context_cache: {
        Row: {
          content: string
          key: string
          meta: Json
          token_count: number
          updated_at: string
        }
        Insert: {
          content?: string
          key: string
          meta?: Json
          token_count?: number
          updated_at?: string
        }
        Update: {
          content?: string
          key?: string
          meta?: Json
          token_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      ai_delivery_logs: {
        Row: {
          conv_id: string | null
          created_at: string
          customer_id: string | null
          details: Json
          event_type: string
          id: string
          line_user_id: string | null
          message: string | null
          severity: string
        }
        Insert: {
          conv_id?: string | null
          created_at?: string
          customer_id?: string | null
          details?: Json
          event_type: string
          id?: string
          line_user_id?: string | null
          message?: string | null
          severity?: string
        }
        Update: {
          conv_id?: string | null
          created_at?: string
          customer_id?: string | null
          details?: Json
          event_type?: string
          id?: string
          line_user_id?: string | null
          message?: string | null
          severity?: string
        }
        Relationships: []
      }
      ai_token_usage: {
        Row: {
          completion_tokens: number
          cost_usd: number
          created_at: string
          customer_id: string | null
          id: string
          meta: Json
          model: string
          prompt_tokens: number
          source: string
          total_tokens: number | null
        }
        Insert: {
          completion_tokens?: number
          cost_usd?: number
          created_at?: string
          customer_id?: string | null
          id?: string
          meta?: Json
          model: string
          prompt_tokens?: number
          source: string
          total_tokens?: number | null
        }
        Update: {
          completion_tokens?: number
          cost_usd?: number
          created_at?: string
          customer_id?: string | null
          id?: string
          meta?: Json
          model?: string
          prompt_tokens?: number
          source?: string
          total_tokens?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_token_usage_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          ai_enabled: boolean
          ai_persona: string
          ai_whitelist_enabled: boolean
          ai_whitelist_user_ids: string[]
          allowed_service_types: string[]
          auto_tag_settings: Json
          bot_mode: string
          comparison_instruction: string
          comparison_kb_category: string | null
          comparison_phase_enabled: boolean
          confidence_threshold: number
          cooldown_minutes: number
          created_at: string
          customer_pronouns_allowed: string[]
          debounce_seconds: number
          end_time: string
          fallback_message: string
          fallback_mute_hours: number
          followup_enabled: boolean
          followup_hours: number
          followup_instruction: string | null
          forbidden_pronouns: string[]
          forbidden_terms: string[]
          handover_extract_enabled: boolean
          handover_extract_overwrite_mode: string
          handover_extract_timeout_ms: number
          handover_extract_triggers: Json
          handover_intro_phone: string
          handover_intro_postcap: string
          handover_intro_tax: string
          handover_summary_fields: Json
          handover_summary_header: string
          id: string
          image_rule_no_extra: string
          image_rule_no_format: string
          image_rule_no_repeat: string
          image_selection_rules: string
          intent_collection_order: string
          intent_fields: Json
          kb_menu_title_keywords: string[]
          key: string
          location_keywords: string[]
          manual_chat_hours: number
          max_images_per_reply: number
          menu_request_keywords: string[]
          out_of_hours_message: string
          out_of_hours_message_enabled: boolean
          phase2_instruction: string
          phone_mute_hours: number
          post_phone_max_replies: number
          reply_bubbles: number
          reply_length: number
          schedule_enabled: boolean
          self_pronouns_allowed: string[]
          service_area_kb_title: string
          sla_hours: number
          start_time: string
          strict_rules: string[]
          tax_id_keywords: string[]
          tier_list: Json
          tier_special_rules: string
          trivial_replies: string[]
          unable_to_reply_enabled: boolean
          unable_to_reply_message: string
          updated_at: string
        }
        Insert: {
          ai_enabled?: boolean
          ai_persona?: string
          ai_whitelist_enabled?: boolean
          ai_whitelist_user_ids?: string[]
          allowed_service_types?: string[]
          auto_tag_settings?: Json
          bot_mode?: string
          comparison_instruction?: string
          comparison_kb_category?: string | null
          comparison_phase_enabled?: boolean
          confidence_threshold?: number
          cooldown_minutes?: number
          created_at?: string
          customer_pronouns_allowed?: string[]
          debounce_seconds?: number
          end_time?: string
          fallback_message?: string
          fallback_mute_hours?: number
          followup_enabled?: boolean
          followup_hours?: number
          followup_instruction?: string | null
          forbidden_pronouns?: string[]
          forbidden_terms?: string[]
          handover_extract_enabled?: boolean
          handover_extract_overwrite_mode?: string
          handover_extract_timeout_ms?: number
          handover_extract_triggers?: Json
          handover_intro_phone?: string
          handover_intro_postcap?: string
          handover_intro_tax?: string
          handover_summary_fields?: Json
          handover_summary_header?: string
          id?: string
          image_rule_no_extra?: string
          image_rule_no_format?: string
          image_rule_no_repeat?: string
          image_selection_rules?: string
          intent_collection_order?: string
          intent_fields?: Json
          kb_menu_title_keywords?: string[]
          key: string
          location_keywords?: string[]
          manual_chat_hours?: number
          max_images_per_reply?: number
          menu_request_keywords?: string[]
          out_of_hours_message?: string
          out_of_hours_message_enabled?: boolean
          phase2_instruction?: string
          phone_mute_hours?: number
          post_phone_max_replies?: number
          reply_bubbles?: number
          reply_length?: number
          schedule_enabled?: boolean
          self_pronouns_allowed?: string[]
          service_area_kb_title?: string
          sla_hours?: number
          start_time?: string
          strict_rules?: string[]
          tax_id_keywords?: string[]
          tier_list?: Json
          tier_special_rules?: string
          trivial_replies?: string[]
          unable_to_reply_enabled?: boolean
          unable_to_reply_message?: string
          updated_at?: string
        }
        Update: {
          ai_enabled?: boolean
          ai_persona?: string
          ai_whitelist_enabled?: boolean
          ai_whitelist_user_ids?: string[]
          allowed_service_types?: string[]
          auto_tag_settings?: Json
          bot_mode?: string
          comparison_instruction?: string
          comparison_kb_category?: string | null
          comparison_phase_enabled?: boolean
          confidence_threshold?: number
          cooldown_minutes?: number
          created_at?: string
          customer_pronouns_allowed?: string[]
          debounce_seconds?: number
          end_time?: string
          fallback_message?: string
          fallback_mute_hours?: number
          followup_enabled?: boolean
          followup_hours?: number
          followup_instruction?: string | null
          forbidden_pronouns?: string[]
          forbidden_terms?: string[]
          handover_extract_enabled?: boolean
          handover_extract_overwrite_mode?: string
          handover_extract_timeout_ms?: number
          handover_extract_triggers?: Json
          handover_intro_phone?: string
          handover_intro_postcap?: string
          handover_intro_tax?: string
          handover_summary_fields?: Json
          handover_summary_header?: string
          id?: string
          image_rule_no_extra?: string
          image_rule_no_format?: string
          image_rule_no_repeat?: string
          image_selection_rules?: string
          intent_collection_order?: string
          intent_fields?: Json
          kb_menu_title_keywords?: string[]
          key?: string
          location_keywords?: string[]
          manual_chat_hours?: number
          max_images_per_reply?: number
          menu_request_keywords?: string[]
          out_of_hours_message?: string
          out_of_hours_message_enabled?: boolean
          phase2_instruction?: string
          phone_mute_hours?: number
          post_phone_max_replies?: number
          reply_bubbles?: number
          reply_length?: number
          schedule_enabled?: boolean
          self_pronouns_allowed?: string[]
          service_area_kb_title?: string
          sla_hours?: number
          start_time?: string
          strict_rules?: string[]
          tax_id_keywords?: string[]
          tier_list?: Json
          tier_special_rules?: string
          trivial_replies?: string[]
          unable_to_reply_enabled?: boolean
          unable_to_reply_message?: string
          updated_at?: string
        }
        Relationships: []
      }
      auto_responses: {
        Row: {
          created_at: string
          file_urls: string[]
          id: string
          image_urls: string[]
          is_active: boolean
          name: string
          sort_order: number
          text: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          file_urls?: string[]
          id?: string
          image_urls?: string[]
          is_active?: boolean
          name: string
          sort_order?: number
          text?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          file_urls?: string[]
          id?: string
          image_urls?: string[]
          is_active?: boolean
          name?: string
          sort_order?: number
          text?: string
          updated_at?: string
        }
        Relationships: []
      }
      broadcast_campaigns: {
        Row: {
          created_at: string
          created_by: string | null
          failed_count: number
          id: string
          messages: Json
          name: string
          scheduled_at: string | null
          sent_at: string | null
          status: string
          success_count: number
          target_match_mode: string
          target_statuses: string[]
          target_tags: string[]
          total_recipients: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          failed_count?: number
          id?: string
          messages?: Json
          name: string
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          success_count?: number
          target_match_mode?: string
          target_statuses?: string[]
          target_tags?: string[]
          total_recipients?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          failed_count?: number
          id?: string
          messages?: Json
          name?: string
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          success_count?: number
          target_match_mode?: string
          target_statuses?: string[]
          target_tags?: string[]
          total_recipients?: number
          updated_at?: string
        }
        Relationships: []
      }
      broadcast_recipients: {
        Row: {
          campaign_id: string
          created_at: string
          customer_id: string | null
          error_message: string | null
          id: string
          line_user_id: string
          sent_at: string | null
          status: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          customer_id?: string | null
          error_message?: string | null
          id?: string
          line_user_id: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          customer_id?: string | null
          error_message?: string | null
          id?: string
          line_user_id?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "broadcast_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      catering_packages: {
        Row: {
          ai_instruction: string | null
          category: string | null
          created_at: string
          custom_attributes: Json
          description: string | null
          embedded_at: string | null
          embedding: string | null
          embedding_text: string | null
          id: string
          image_urls: string[]
          is_active: boolean
          min_condition: string | null
          name: string
          notes: string | null
          pricing_tiers: Json
          updated_at: string
          video_urls: Json
        }
        Insert: {
          ai_instruction?: string | null
          category?: string | null
          created_at?: string
          custom_attributes?: Json
          description?: string | null
          embedded_at?: string | null
          embedding?: string | null
          embedding_text?: string | null
          id?: string
          image_urls?: string[]
          is_active?: boolean
          min_condition?: string | null
          name: string
          notes?: string | null
          pricing_tiers?: Json
          updated_at?: string
          video_urls?: Json
        }
        Update: {
          ai_instruction?: string | null
          category?: string | null
          created_at?: string
          custom_attributes?: Json
          description?: string | null
          embedded_at?: string | null
          embedding?: string | null
          embedding_text?: string | null
          id?: string
          image_urls?: string[]
          is_active?: boolean
          min_condition?: string | null
          name?: string
          notes?: string | null
          pricing_tiers?: Json
          updated_at?: string
          video_urls?: Json
        }
        Relationships: []
      }
      conversations: {
        Row: {
          admin_user_id: string | null
          confidence_score: number | null
          created_at: string
          customer_id: string
          id: string
          is_fallback: boolean
          line_message_id: string | null
          message: string
          quote_token: string | null
          quoted_message_id: string | null
          sender: Database["public"]["Enums"]["message_sender"]
        }
        Insert: {
          admin_user_id?: string | null
          confidence_score?: number | null
          created_at?: string
          customer_id: string
          id?: string
          is_fallback?: boolean
          line_message_id?: string | null
          message: string
          quote_token?: string | null
          quoted_message_id?: string | null
          sender?: Database["public"]["Enums"]["message_sender"]
        }
        Update: {
          admin_user_id?: string | null
          confidence_score?: number | null
          created_at?: string
          customer_id?: string
          id?: string
          is_fallback?: boolean
          line_message_id?: string | null
          message?: string
          quote_token?: string | null
          quoted_message_id?: string | null
          sender?: Database["public"]["Enums"]["message_sender"]
        }
        Relationships: [
          {
            foreignKeyName: "conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_quoted_message_id_fkey"
            columns: ["quoted_message_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_events: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string
          event_date: string | null
          event_type: string | null
          guest_count: number | null
          id: string
          notes: string | null
          package_name: string | null
          status: string
          total_amount: number | null
          venue: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id: string
          event_date?: string | null
          event_type?: string | null
          guest_count?: number | null
          id?: string
          notes?: string | null
          package_name?: string | null
          status?: string
          total_amount?: number | null
          venue?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string
          event_date?: string | null
          event_type?: string | null
          guest_count?: number | null
          id?: string
          notes?: string | null
          package_name?: string | null
          status?: string
          total_amount?: number | null
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          admin_notes: string | null
          ai_active: boolean
          ai_resumed_at: string | null
          clv_amount: number
          contact_year: number | null
          conversation_summary: string | null
          created_at: string
          display_name: string | null
          event_date: string | null
          event_month: string | null
          event_type: string | null
          guest_count: number | null
          id: string
          intent_data: Json
          last_message_at: string | null
          last_message_snippet: string | null
          last_sent_image_titles: string[]
          line_user_id: string
          manual_chat_until: string | null
          nickname: string | null
          phone: string | null
          phone_saved_at: string | null
          picture_refreshed_at: string | null
          picture_url: string | null
          sla_deadline: string | null
          status: Database["public"]["Enums"]["customer_status"]
          summary_until_message_id: string | null
          tags: string[]
          tax_id: string | null
          tier: string | null
          unread_count: number
          updated_at: string
          venue: string | null
        }
        Insert: {
          admin_notes?: string | null
          ai_active?: boolean
          ai_resumed_at?: string | null
          clv_amount?: number
          contact_year?: number | null
          conversation_summary?: string | null
          created_at?: string
          display_name?: string | null
          event_date?: string | null
          event_month?: string | null
          event_type?: string | null
          guest_count?: number | null
          id?: string
          intent_data?: Json
          last_message_at?: string | null
          last_message_snippet?: string | null
          last_sent_image_titles?: string[]
          line_user_id: string
          manual_chat_until?: string | null
          nickname?: string | null
          phone?: string | null
          phone_saved_at?: string | null
          picture_refreshed_at?: string | null
          picture_url?: string | null
          sla_deadline?: string | null
          status?: Database["public"]["Enums"]["customer_status"]
          summary_until_message_id?: string | null
          tags?: string[]
          tax_id?: string | null
          tier?: string | null
          unread_count?: number
          updated_at?: string
          venue?: string | null
        }
        Update: {
          admin_notes?: string | null
          ai_active?: boolean
          ai_resumed_at?: string | null
          clv_amount?: number
          contact_year?: number | null
          conversation_summary?: string | null
          created_at?: string
          display_name?: string | null
          event_date?: string | null
          event_month?: string | null
          event_type?: string | null
          guest_count?: number | null
          id?: string
          intent_data?: Json
          last_message_at?: string | null
          last_message_snippet?: string | null
          last_sent_image_titles?: string[]
          line_user_id?: string
          manual_chat_until?: string | null
          nickname?: string | null
          phone?: string | null
          phone_saved_at?: string | null
          picture_refreshed_at?: string | null
          picture_url?: string | null
          sla_deadline?: string | null
          status?: Database["public"]["Enums"]["customer_status"]
          summary_until_message_id?: string | null
          tags?: string[]
          tax_id?: string | null
          tier?: string | null
          unread_count?: number
          updated_at?: string
          venue?: string | null
        }
        Relationships: []
      }
      knowledge_base: {
        Row: {
          bundle_image_titles: string[]
          category: string | null
          content: string
          created_at: string
          embedded_at: string | null
          embedding: string | null
          embedding_text: string | null
          id: string
          image_urls: string[]
          is_always_include: boolean
          sort_order: number
          status: string
          title: string
          updated_at: string
          video_urls: Json
        }
        Insert: {
          bundle_image_titles?: string[]
          category?: string | null
          content?: string
          created_at?: string
          embedded_at?: string | null
          embedding?: string | null
          embedding_text?: string | null
          id?: string
          image_urls?: string[]
          is_always_include?: boolean
          sort_order?: number
          status?: string
          title: string
          updated_at?: string
          video_urls?: Json
        }
        Update: {
          bundle_image_titles?: string[]
          category?: string | null
          content?: string
          created_at?: string
          embedded_at?: string | null
          embedding?: string | null
          embedding_text?: string | null
          id?: string
          image_urls?: string[]
          is_always_include?: boolean
          sort_order?: number
          status?: string
          title?: string
          updated_at?: string
          video_urls?: Json
        }
        Relationships: []
      }
      knowledge_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      line_config: {
        Row: {
          channel_access_token: string
          channel_id: string
          channel_secret: string
          id: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          channel_access_token?: string
          channel_id?: string
          channel_secret?: string
          id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          channel_access_token?: string
          channel_id?: string
          channel_secret?: string
          id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      package_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      promotions: {
        Row: {
          applicable_categories: string[]
          created_at: string
          description: string | null
          embedded_at: string | null
          embedding: string | null
          embedding_text: string | null
          id: string
          image_urls: string[]
          is_active: boolean
          min_guests: number | null
          name: string
          updated_at: string
          video_urls: Json
        }
        Insert: {
          applicable_categories?: string[]
          created_at?: string
          description?: string | null
          embedded_at?: string | null
          embedding?: string | null
          embedding_text?: string | null
          id?: string
          image_urls?: string[]
          is_active?: boolean
          min_guests?: number | null
          name: string
          updated_at?: string
          video_urls?: Json
        }
        Update: {
          applicable_categories?: string[]
          created_at?: string
          description?: string | null
          embedded_at?: string | null
          embedding?: string | null
          embedding_text?: string | null
          id?: string
          image_urls?: string[]
          is_active?: boolean
          min_guests?: number | null
          name?: string
          updated_at?: string
          video_urls?: Json
        }
        Relationships: []
      }
      role_menu_permissions: {
        Row: {
          menu_keys: string[]
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          menu_keys?: string[]
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          menu_keys?: string[]
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          ai_tag_instructions: string | null
          color: string
          created_at: string
          description: string | null
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          ai_tag_instructions?: string | null
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          ai_tag_instructions?: string | null
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      user_menu_permissions: {
        Row: {
          menu_keys: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          menu_keys?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          menu_keys?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bulk_add_tag: {
        Args: { _customer_ids: string[]; _tag_name: string }
        Returns: number
      }
      bulk_delete_tags: {
        Args: { _names: string[]; _strip_from_customers?: boolean }
        Returns: number
      }
      compute_auto_tags:
        | {
            Args: { _cfg: Json; _nickname: string; _status: string }
            Returns: string[]
          }
        | {
            Args: {
              _cfg: Json
              _nickname: string
              _status: string
              _tax_id?: string
            }
            Returns: string[]
          }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin_or_owner: { Args: { _user_id: string }; Returns: boolean }
      is_staff_member: { Args: { _user_id: string }; Returns: boolean }
      managed_auto_tags: { Args: { _cfg: Json }; Returns: string[] }
      match_catering_packages: {
        Args: {
          match_count?: number
          min_similarity?: number
          query_embedding: string
        }
        Returns: {
          id: string
          similarity: number
        }[]
      }
      match_knowledge_base: {
        Args: {
          match_count?: number
          min_similarity?: number
          query_embedding: string
        }
        Returns: {
          id: string
          similarity: number
        }[]
      }
      match_promotions: {
        Args: {
          match_count?: number
          min_similarity?: number
          query_embedding: string
        }
        Returns: {
          id: string
          similarity: number
        }[]
      }
      merge_tags: {
        Args: { _source_names: string[]; _target_name: string }
        Returns: number
      }
      rescan_auto_tags: { Args: never; Returns: number }
    }
    Enums: {
      app_role: "admin" | "manager" | "staff" | "owner"
      customer_status:
        | "new"
        | "returning"
        | "pending_quote"
        | "pending_confirm"
        | "confirmed"
        | "confirmed_returning"
        | "cancelled"
        | "inquiry"
        | "postponed"
      message_sender: "customer" | "ai" | "admin"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["admin", "manager", "staff", "owner"],
      customer_status: [
        "new",
        "returning",
        "pending_quote",
        "pending_confirm",
        "confirmed",
        "confirmed_returning",
        "cancelled",
        "inquiry",
        "postponed",
      ],
      message_sender: ["customer", "ai", "admin"],
    },
  },
} as const
