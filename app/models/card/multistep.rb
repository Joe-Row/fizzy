module Card::Multistep
  extend ActiveSupport::Concern

  included do
    has_many :steps, -> { order(:position, :id) }, dependent: :destroy
  end
end
