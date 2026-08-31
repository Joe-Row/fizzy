class Cards::PositionsController < ApplicationController
  include CardScoped

  def create
    @card.move_before(before_card)
    head :no_content
  end

  private
    def before_card
      if params[:before_id].present?
        Current.user.accessible_cards.find_by!(number: params[:before_id])
      end
    end
end
