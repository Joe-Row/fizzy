class Card < ApplicationRecord
  include Accessible, Assignable, Attachments, Broadcastable, Closeable, Colored, Commentable,
    Entropic, Eventable, Exportable, Golden, Mentions, Multistep, Pinnable, Postponable, Promptable,
    Readable, Searchable, Stallable, Statuses, Storage::Tracked, Taggable, Triageable, Watchable

  belongs_to :account, default: -> { board.account }
  belongs_to :board
  belongs_to :creator, class_name: "User", default: -> { Current.user }
  belongs_to :parent_card, class_name: "Card", optional: true, inverse_of: :child_cards
  has_many :child_cards, class_name: "Card", foreign_key: :parent_card_id, inverse_of: :parent_card, dependent: :destroy

  has_many :reactions, -> { order(:created_at) }, as: :reactable, dependent: :delete_all
  has_one_attached :image, dependent: :purge_later

  has_rich_text :description

  before_save :set_default_title, if: :published?
  before_create :assign_number
  before_destroy :destroy_child_cards_explicitly, prepend: true

  after_save   -> { board.touch }, if: :published?
  after_touch  -> { board.touch }, if: :published?
  after_update :handle_board_change, if: :saved_change_to_board_id?

  scope :reverse_chronologically, -> { order created_at:     :desc, id: :desc }
  scope :chronologically,         -> { order created_at:     :asc,  id: :asc  }
  scope :latest,                  -> { order last_active_at: :desc, id: :desc }
  scope :with_users,              -> { preload(creator: [ :avatar_attachment, :account ], assignees: [ :avatar_attachment, :account ]) }
  scope :preloaded,               -> { with_users.preload(:column, :tags, :steps, :closure, :goldness, :activity_spike, :image_attachment, reactions: :reacter, board: [ :entropy, :columns ], not_now: [ :user ]).with_rich_text_description_and_embeds }

  scope :indexed_by, ->(index) do
    case index
    when "stalled" then stalled
    when "postponing_soon" then postponing_soon
    when "closed" then closed
    when "maybe" then awaiting_triage
    when "not_now" then postponed.latest
    when "golden" then golden
    when "draft" then drafted
    else all
    end
  end

  scope :sorted_by, ->(sort) do
    case sort
    when "newest" then reverse_chronologically
    when "oldest" then chronologically
    when "latest" then latest
    else latest
    end
  end

  def card
    self
  end

  def to_param
    number.to_s
  end

  def move_to(new_board)
    transaction do
      card.update!(board: new_board)
      card.events.update_all(board_id: new_board.id)
      Event.where(eventable: card.comments).update_all(board_id: new_board.id)
    end
  end

  def filled?
    title.present? || description.present?
  end

  # Board number stays on `number` / URLs / data-id. Tasks display as parent.N
  def display_number
    return number.to_s if parent_card_id.blank?

    parent = parent_card
    return number.to_s unless parent

    sibling_ids = parent.child_cards.order(:number).pluck(:id)
    idx = sibling_ids.index(id)
    return number.to_s unless idx

    "#{parent.number}.#{idx + 1}"
  end

  private
    def destroy_child_cards_explicitly
      self.class.where(parent_card_id: id).find_each(&:destroy!)
    end
    def set_default_title
      self.title = "Untitled" if title.blank?
    end

    def handle_board_change
      old_board = account.boards.find_by(id: board_id_before_last_save)

      transaction do
        update! column: nil
        track_board_change_event(old_board.name)
        grant_access_to_assignees unless board.all_access?
      end

      remove_inaccessible_notifications_later
      clean_inaccessible_data_later
    end

    def track_board_change_event(old_board_name)
      track_event "board_changed", particulars: { old_board: old_board_name, new_board: board.name }
    end

    def assign_number
      self.number ||= account.with_lock { account.increment!(:cards_count).cards_count }
    end
end
