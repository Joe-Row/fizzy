class Step < ApplicationRecord
  belongs_to :account, default: -> { card.account }
  belongs_to :card, touch: true
  belongs_to :child_card, class_name: "Card", optional: true, inverse_of: :origin_step

  scope :completed, -> { where(completed: true) }
  scope :ranked, -> { order(:position, :id) }

  validates :content, presence: true

  before_create :assign_position
  after_save :sync_child_card_closure, if: :saved_change_to_completed?
  after_destroy :destroy_linked_child_card

  def completed?
    completed
  end

  def move_before(other)
    transaction do
      steps = card.steps.ranked.to_a
      steps.delete(self)
      index = other ? (steps.index(other) || steps.length) : steps.length
      steps.insert(index, self)

      steps.each_with_index do |step, i|
        step.update_column(:position, i) if step.position != i
        if (linked = step.child_card) && linked.position != i
          linked.update_column(:position, i)
        end
      end
    end
  end

  private
    def assign_position
      return unless has_attribute?(:position)
      return if will_save_change_to_position? && !position.to_i.zero?

      self.position = (card.steps.where.not(id: id).maximum(:position) || -1) + 1
    end

    def sync_child_card_closure
      if (linked = child_card)
        if completed?
          linked.close unless linked.closed?
        else
          linked.reopen if linked.closed?
        end
      end
    end

    def destroy_linked_child_card
      if (linked = Card.find_by(id: child_card_id))
        linked.destroy
      end
    end
end
