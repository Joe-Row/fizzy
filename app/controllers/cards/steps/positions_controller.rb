class Cards::Steps::PositionsController < ApplicationController
  include CardScoped

  before_action :set_step

  def create
    @step.move_before(before_step)
    head :no_content
  end

  private
    def set_step
      @step = @card.steps.find(params[:step_id])
    end

    def before_step
      if params[:before_id].present?
        @card.steps.find(params[:before_id])
      end
    end
end
